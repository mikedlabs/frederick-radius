import type { EventWithMeta } from "@/lib/loaders/events";
import type { EventsBySlugsResolution } from "@/lib/loaders/eventsBySlugs";
import { normalizeRequestedEventSlugList } from "@/lib/events/eventSlugBatch";

/** Hydrate a bounded saved-event batch without putting personal state in a
 * query string or risking browser/proxy URL limits. Exported for the focused
 * client contract test. */
export async function fetchSavedEventsHydration(
  slugs: readonly unknown[],
  signal?: AbortSignal,
): Promise<EventsBySlugsResolution> {
  const requested = normalizeRequestedEventSlugList(slugs);
  const response = await fetch("/api/events/by-slugs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slugs: requested }),
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as {
    events?: unknown;
    resolvedSlugs?: unknown;
    unresolvedSlugs?: unknown;
    missingSlugs?: unknown;
    degraded?: unknown;
  };
  if (!Array.isArray(data.events)) throw new Error("Invalid events response");
  const events = data.events as EventWithMeta[];
  const resolved = new Set(events.map((event) => event.slug));
  // During an atomic deployment these fields arrive together. The fallback is
  // intentionally conservative for an older cached API response: an omitted
  // row remains unresolved rather than being misreported as deleted.
  const unresolvedSlugs = Array.isArray(data.unresolvedSlugs)
    ? normalizeRequestedEventSlugList(data.unresolvedSlugs)
    : requested.filter((slug) => !resolved.has(slug));
  const missingSlugs = Array.isArray(data.missingSlugs)
    ? normalizeRequestedEventSlugList(data.missingSlugs)
    : [];
  const resolvedSlugs = Array.isArray(data.resolvedSlugs)
    ? data.resolvedSlugs.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return [];
        }
        const row = value as Record<string, unknown>;
        const requestedSlug = normalizeRequestedEventSlugList([
          row.requestedSlug,
        ])[0];
        const canonicalSlug = normalizeRequestedEventSlugList([
          row.canonicalSlug,
        ])[0];
        return requestedSlug && canonicalSlug
          ? [{ requestedSlug, canonicalSlug }]
          : [];
      })
    : events.map((event) => ({
        requestedSlug: event.slug,
        canonicalSlug: event.slug,
      }));
  return {
    events,
    resolvedSlugs,
    unresolvedSlugs,
    missingSlugs,
    degraded:
      typeof data.degraded === "boolean"
        ? data.degraded
        : unresolvedSlugs.length > 0,
  };
}

export function mergeSavedEventHydration(
  previous: ReadonlyMap<string, EventWithMeta>,
  result: EventsBySlugsResolution,
): Map<string, EventWithMeta> {
  const next = new Map(previous);
  const resolved = new Set(result.events.map((event) => event.slug));
  for (const slug of result.missingSlugs) {
    // A malformed response must not let a status field override an event row
    // delivered in the same payload. The row is the stronger evidence.
    if (!resolved.has(slug)) next.delete(slug);
  }
  for (const event of result.events) next.set(event.slug, event);
  const eventsByCanonical = new Map(
    result.events.map((event) => [event.slug, event]),
  );
  for (const binding of result.resolvedSlugs) {
    const event = eventsByCanonical.get(binding.canonicalSlug);
    if (event) next.set(binding.requestedSlug, event);
  }
  return next;
}
