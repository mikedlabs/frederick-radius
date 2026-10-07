import { normalizeRequestedEventSlugList } from "@/lib/events/eventSlugBatch";
import { createAbortDeadline } from "@/lib/promise-deadline";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { EventsBySlugsResolution } from "@/lib/loaders/eventsBySlugs";

export const DAY_PLAN_LOOKUP_DEADLINE_MS = 15_000;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validSlug = (value: unknown): value is string =>
  typeof value === "string" && normalizeRequestedEventSlugList([value])[0] === value;

// JSON object key order carries no authority. Every supplied evidence field
// must agree; aliases and request order cannot decide between conflicting rows.
function sameEvidence(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameEvidence(value, right[index]));
  }
  if (!record(left) || !record(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) =>
    Object.prototype.hasOwnProperty.call(right, key) && sameEvidence(left[key], right[key]));
}

/** Public rows and their requested identities must agree before rendering. */
export function parseDayPlanHydration(value: unknown, requested: readonly string[]): EventsBySlugsResolution {
  if (!record(value) || !Array.isArray(value.events) || value.events.length > requested.length) {
    throw new Error("Day Plan response is unavailable");
  }
  const suppliedEvents = value.events.filter((row): row is EventWithMeta =>
    record(row) && validSlug(row.slug) && typeof row.title === "string" && row.title.trim().length > 0 &&
    typeof row.starts_at === "string" && Number.isFinite(Date.parse(row.starts_at)) &&
    typeof row.ends_at === "string" && typeof row.venue_name === "string" &&
    typeof row.category === "string" && typeof row.description === "string" &&
    Array.isArray(row.audience),
  );
  if (suppliedEvents.length !== value.events.length) {
    throw new Error("Day Plan response is unavailable");
  }
  const canonicalRows = new Map<string, EventWithMeta>();
  const rowCounts = new Map<string, number>();
  for (const row of suppliedEvents) {
    const previous = canonicalRows.get(row.slug);
    if (previous && !sameEvidence(previous, row)) throw new Error("Conflicting event evidence");
    canonicalRows.set(row.slug, row);
    rowCounts.set(row.slug, (rowCounts.get(row.slug) ?? 0) + 1);
  }
  const events = Array.from(canonicalRows.values());
  const wanted = new Set(requested);
  const bySlug = new Set(events.map((row) => row.slug));
  const resolvedSlugs: EventsBySlugsResolution["resolvedSlugs"] = [];
  const seen = new Set<string>();
  const mappings = value.resolvedSlugs;
  if (mappings !== undefined && !Array.isArray(mappings)) throw new Error("Invalid event identities");
  for (const mapping of mappings ?? events.map((row) => ({ requestedSlug: row.slug, canonicalSlug: row.slug }))) {
    if (!record(mapping) || !validSlug(mapping.requestedSlug) || !validSlug(mapping.canonicalSlug) ||
        !wanted.has(mapping.requestedSlug) || !bySlug.has(mapping.canonicalSlug) || seen.has(mapping.requestedSlug)) {
      throw new Error("Invalid event identities");
    }
    resolvedSlugs.push({ requestedSlug: mapping.requestedSlug, canonicalSlug: mapping.canonicalSlug });
    seen.add(mapping.requestedSlug);
  }
  // The public resolver may emit one equivalent row for each saved alias.
  // Each supplied row still needs a distinct validated requested identity.
  if (events.some((row) => (rowCounts.get(row.slug) ?? 0) >
      resolvedSlugs.filter((mapping) => mapping.canonicalSlug === row.slug).length)) {
    throw new Error("Unrequested event row");
  }
  const readStatus = (key: "missingSlugs" | "unresolvedSlugs") => {
    const list = value[key];
    if (list === undefined) return [];
    if (!Array.isArray(list)) throw new Error("Invalid event status");
    return list.map((slug) => {
      if (!validSlug(slug) || !wanted.has(slug) || seen.has(slug)) throw new Error("Invalid event status");
      seen.add(slug);
      return slug;
    });
  };
  const missingSlugs = readStatus("missingSlugs");
  const unresolvedSlugs = readStatus("unresolvedSlugs");
  // A validated known-missing requested canonical contradicts an older alias
  // for that same row. Clear its details through the caller's missing path,
  // including previously displayed details, while keeping exact local IDs.
  const knownMissing = new Set(missingSlugs);
  const publicMappings = resolvedSlugs.filter((mapping) => {
    if (!knownMissing.has(mapping.canonicalSlug)) return true;
    missingSlugs.push(mapping.requestedSlug);
    return false;
  });
  const publicEvents = events.filter((row) => !knownMissing.has(row.slug));
  // Older responses cannot establish that an omitted local reference is gone.
  unresolvedSlugs.push(...requested.filter((slug) => !seen.has(slug)));
  return { events: publicEvents, resolvedSlugs: publicMappings, missingSlugs, unresolvedSlugs,
    degraded: value.degraded === true || unresolvedSlugs.length > 0 };
}

/** One existing public batch; the same deadline covers headers and JSON body. */
export async function fetchDayPlanHydration(
  requested: readonly string[], parentSignal: AbortSignal,
  timeoutMs = DAY_PLAN_LOOKUP_DEADLINE_MS,
): Promise<EventsBySlugsResolution> {
  const slugs = normalizeRequestedEventSlugList(requested);
  if (slugs.length === 0 || slugs.length !== requested.length || slugs.some((slug, index) => slug !== requested[index])) throw new Error("Invalid Day Plan references");
  const deadline = createAbortDeadline(timeoutMs, parentSignal);
  let onAbort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new DOMException("Day Plan check timed out or was cancelled", "AbortError"));
    if (deadline.signal.aborted) onAbort();
    else deadline.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const body = await Promise.race([
      deadline.signal.aborted ? interrupted : fetch("/api/events/by-slugs", {
        method: "POST", cache: "no-store", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: requested }), signal: deadline.signal,
      }).then((response) => {
        if (!response.ok) throw new Error("Day Plan source is unavailable");
        return response.json();
      }),
      interrupted,
    ]);
    if (deadline.signal.aborted) throw new DOMException("Day Plan check was cancelled", "AbortError");
    return parseDayPlanHydration(body, requested);
  } finally {
    deadline.signal.removeEventListener("abort", onAbort);
    deadline.dispose();
  }
}
