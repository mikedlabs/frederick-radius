import { cache } from "react";
import type { EventWithMeta } from "@/lib/loaders/events";
import { getEventBySlug } from "@/lib/loaders/events";
import { getLiveCardEventBySlug } from "@/lib/loaders/liveEvents";
import { getIngestedCardBySlug } from "@/lib/loaders/ingestedEvents";
import {
  assembleUnifiedEvents,
  type UnifiedEvents,
} from "@/lib/loaders/unifiedEvents";
import { hasActionableAttendance } from "@/lib/events/attendance";
import { withVenueThumb } from "@/lib/loaders/eventThumb";
import { easternDayKey } from "@/lib/tz";
import {
  archivedEventBySlug,
  persistEventIdentity,
  type ArchivedEventIdentity,
  type PersistedEventIdentity,
} from "@/lib/events/event-identity";

export type EventResolutionKind =
  | "seed"
  | "archive"
  | "unified"
  | "live"
  | "ingested";

export type ResolvedEventPage = {
  event: EventWithMeta;
  kind: EventResolutionKind;
};

export type EventLookupContext = {
  signal: AbortSignal;
  deadline: number;
};

type EventResolverSources = {
  seed: (slug: string) => EventWithMeta | null;
  archive: (
    slug: string,
    context: EventLookupContext,
  ) => Promise<ArchivedEventIdentity | null>;
  live: (
    slug: string,
    context: EventLookupContext,
  ) => Promise<EventWithMeta | null>;
  unified: (
    slug: string,
    now: Date,
    context: EventLookupContext,
  ) => Promise<EventWithMeta | null>;
  ingested: (
    slug: string,
    context: EventLookupContext,
  ) => Promise<EventWithMeta | null>;
  persist: (
    event: EventWithMeta,
    aliases: readonly string[],
  ) => Promise<PersistedEventIdentity | null>;
};

const DEFAULT_SOURCES: EventResolverSources = {
  seed: (slug) => {
    const event = getEventBySlug(slug);
    return event ? withVenueThumb(event) : null;
  },
  archive: (slug, context) =>
    archivedEventBySlug(slug, {
      signal: context.signal,
      timeoutMs: Math.max(0, context.deadline - Date.now()),
    }),
  live: (slug, context) =>
    context.signal.aborted
      ? Promise.resolve(null)
      : getLiveCardEventBySlug(slug, 90, context),
  unified: async (slug, now, context) => {
    if (context.signal.aborted) return null;
    const result = await assembleUnifiedEvents(now);
    if (context.signal.aborted) return null;
    return eventFromUnifiedSnapshot(slug, result);
  },
  ingested: (slug, context) =>
    context.signal.aborted
      ? Promise.resolve(null)
      : getIngestedCardBySlug(slug, context),
  persist: (event, aliases) => persistEventIdentity(event, aliases),
};

export const EVENT_DEEP_LINK_TIMEOUT_MS = 2_500;
export const EVENT_ARCHIVE_HEAD_START_MS = 450;

type AsyncEventSource = Exclude<EventResolutionKind, "seed">;
type DirectEventSource = Extract<
  AsyncEventSource,
  "unified" | "live" | "ingested"
>;

type EventLookupOutcome =
  | { status: "hit"; event: EventWithMeta }
  | { status: "miss" }
  | { status: "error"; error: unknown };

const LOOKUP_TIMEOUT = Symbol("event-lookup-timeout");

class UnifiedEventSnapshotDegradedError extends Error {
  constructor(readonly unavailable: readonly string[]) {
    super(
      unavailable.length > 0
        ? `Unified event snapshot is incomplete: ${unavailable.join(", ")}`
        : "Unified event snapshot is incomplete.",
    );
    this.name = "UnifiedEventSnapshotDegradedError";
  }
}

/**
 * A hit remains useful even when another provider is degraded. An absent row,
 * however, is only a definitive miss when the unified snapshot is healthy.
 * Keeping this distinction at the source boundary prevents a partial calendar
 * from turning a real event link into a 404.
 */
export function eventFromUnifiedSnapshot(
  slug: string,
  result: Pick<UnifiedEvents, "publicEvents" | "sourceHealth">,
): EventWithMeta | null {
  const event = result.publicEvents.find((candidate) => candidate.slug === slug);
  if (event) return event;
  if (result.sourceHealth.degraded) {
    throw new UnifiedEventSnapshotDegradedError(
      result.sourceHealth.unavailable,
    );
  }
  return null;
}

/**
 * Clean live slugs end in their dashed Eastern calendar day; ingested slugs
 * end in compact YYYYMMDD. A valid past day is useful routing evidence after
 * the durable archive has supplied a definitive miss: the direct live reader
 * only contains events whose start is still ahead, so asking it to rebuild
 * every provider cannot recover that URL. The unified snapshot still runs
 * because a multi-day event can have a past start and remain underway; the
 * ingested reader keeps its historical occurrences.
 *
 * Legacy `live-...-YYYY-MM-DD-HHmm` aliases are deliberately excluded. Only
 * the direct live reader understands that format, including an old alias for
 * a multi-day event that may still be underway.
 */
function eventSlugDay(slug: string): string | null {
  if (slug.startsWith("live-")) return null;
  const dashed = slug.match(/-(\d{4}-\d{2}-\d{2})$/)?.[1];
  const compact = slug.match(/-(\d{4})(\d{2})(\d{2})$/);
  const candidate = dashed ?? (compact
    ? `${compact[1]}-${compact[2]}-${compact[3]}`
    : null);
  if (!candidate) return null;
  const parsed = new Date(`${candidate}T12:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== candidate
  ) {
    return null;
  }
  return candidate;
}

function isPastDatedEventSlug(slug: string, now: Date): boolean {
  const day = eventSlugDay(slug);
  return day !== null && day < easternDayKey(now);
}

const PRODUCTION_PAGE_SOURCES: EventResolverSources = {
  ...DEFAULT_SOURCES,
  unified: async () => null,
  live: (slug, context) => {
    if (context.signal.aborted) return Promise.resolve(null);
    const hasDatedRoutingEvidence =
      slug.startsWith("live-") || eventSlugDay(slug) !== null;
    if (!hasDatedRoutingEvidence) return Promise.resolve(null);
    return getLiveCardEventBySlug(slug, 90, {
      ...context,
      allowNetwork: false,
    });
  },
};

export class EventResolutionTimeoutError extends Error {
  readonly sources: AsyncEventSource[];

  constructor(sources: AsyncEventSource[]) {
    super(`Event lookup timed out: ${sources.join(", ")}`);
    this.name = "EventResolutionTimeoutError";
    this.sources = sources;
  }
}

export class EventResolutionUnavailableError extends Error {
  readonly sources: AsyncEventSource[];

  constructor(sources: AsyncEventSource[]) {
    super(`Event lookup failed: ${sources.join(", ")}`);
    this.name = "EventResolutionUnavailableError";
    this.sources = sources;
  }
}

export function isOperationalEventResolutionError(
  error: unknown,
): error is EventResolutionTimeoutError | EventResolutionUnavailableError {
  return (
    error instanceof EventResolutionTimeoutError ||
    error instanceof EventResolutionUnavailableError
  );
}

function eventLookup(
  lookup: () => Promise<EventWithMeta | null>,
): Promise<EventLookupOutcome> {
  return Promise.resolve()
    .then(lookup)
    .then(
      (event): EventLookupOutcome =>
        event && hasActionableAttendance(event)
          ? { status: "hit", event }
          : { status: "miss" },
      (error): EventLookupOutcome => ({ status: "error", error }),
    );
}

async function settleBeforeDeadline<T>(
  lookup: Promise<T>,
  deadline: number,
): Promise<T | typeof LOOKUP_TIMEOUT> {
  if (deadline <= Date.now()) {
    return Promise.race([lookup, Promise.resolve(LOOKUP_TIMEOUT)]);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookup,
      new Promise<typeof LOOKUP_TIMEOUT>((resolve) => {
        timer = setTimeout(
          () => resolve(LOOKUP_TIMEOUT),
          Math.max(0, deadline - Date.now()),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveArchive(
  slug: string,
  deadline: number,
  sources: Pick<EventResolverSources, "archive">,
): Promise<
  | { status: "hit"; resolution: ResolvedEventPage }
  | { status: "miss" | "error" | "timeout" }
> {
  const controller = new AbortController();
  const archiveDeadline = Math.min(
    deadline,
    Date.now() + EVENT_ARCHIVE_HEAD_START_MS,
  );
  const lookup = Promise.resolve()
    .then(() =>
      sources.archive(slug, {
        signal: controller.signal,
        deadline: archiveDeadline,
      }),
    )
    .then(
      (archive) => {
        if (!archive || !hasActionableAttendance(archive.event)) {
          return { status: "miss" as const };
        }
        return {
          status: "hit" as const,
          resolution: {
            event: archive.event,
            kind: "archive" as const,
          },
        };
      },
      () => ({ status: "error" as const }),
    );
  const outcome = await settleBeforeDeadline(lookup, archiveDeadline);
  controller.abort();
  return outcome === LOOKUP_TIMEOUT ? { status: "timeout" } : outcome;
}

/**
 * Metadata must never be the part of an event request that rebuilds the live
 * calendar. Next resolves metadata before the page can render its route-level
 * recovery UI, so an operational feed failure here used to replace that calm
 * recovery state with a generic document error.
 *
 * Seed data and the durable identity archive are enough to produce rich,
 * source-backed metadata without a provider fanout. A miss, timeout, or store
 * failure returns null and lets the route emit conservative metadata while the
 * page body performs the authoritative lookup. This deliberately does not
 * claim a 404: an event may be real and newly published even when its durable
 * snapshot has not been written yet.
 */
export async function resolveEventMetadataBySlugWithSources(
  slug: string,
  sources: Pick<EventResolverSources, "seed" | "archive">,
): Promise<ResolvedEventPage | null> {
  try {
    const seed = sources.seed(slug);
    if (seed && hasActionableAttendance(seed)) {
      return { event: seed, kind: "seed" };
    }

    const deadline = Date.now() + EVENT_ARCHIVE_HEAD_START_MS;
    const archive = await resolveArchive(slug, deadline, sources);
    return archive.status === "hit" ? archive.resolution : null;
  } catch {
    // Metadata is descriptive, not authoritative. The page body owns the
    // final hit/miss/unavailable decision and its user-facing recovery path.
    return null;
  }
}

async function persistWinner(
  event: EventWithMeta,
  requestedSlug: string,
  sources: EventResolverSources,
): Promise<EventWithMeta> {
  try {
    const identity = await sources.persist(event, [requestedSlug, event.slug]);
    return identity?.snapshot ?? event;
  } catch {
    // Identity storage is additive. A missing migration or transient database
    // failure must not take down a source event that already resolved.
    return event;
  }
}

/**
 * Event detail never assembles the full event board. It resolves a cheap seed,
 * then the durable alias/snapshot index, then races the two source-specific
 * deep-link readers under one deadline. The first usable answer wins and
 * aborts the losing work; a transient timeout is never misreported as a 404.
 */
export async function resolveEventPageBySlugWithSources(
  slug: string,
  now: Date,
  sources: EventResolverSources,
): Promise<ResolvedEventPage | null> {
  const seed = sources.seed(slug);
  if (seed && hasActionableAttendance(seed)) {
    return { event: seed, kind: "seed" };
  }

  const deadline = Date.now() + EVENT_DEEP_LINK_TIMEOUT_MS;
  const timedOut: AsyncEventSource[] = [];
  const failed: AsyncEventSource[] = [];

  const archive = await resolveArchive(slug, deadline, sources);
  if (archive.status === "hit") return archive.resolution;
  if (archive.status === "timeout") timedOut.push("archive");
  if (archive.status === "error") failed.push("archive");

  if (Date.now() >= deadline) {
    throw new EventResolutionTimeoutError(
      timedOut.length > 0 ? timedOut : ["live", "ingested"],
    );
  }

  const controller = new AbortController();
  const context = { signal: controller.signal, deadline };
  const pending = new Map<
    DirectEventSource,
    Promise<{ source: DirectEventSource; outcome: EventLookupOutcome }>
  >();

  // The unified snapshot is the exact source contract used by the browse
  // board. Resolve it alongside the provider-specific readers so a card cannot
  // be visible while its own detail URL returns a definitive 404 merely
  // because the durable archive has not warmed yet. The shared snapshot is
  // normally already hot after /events or /api/events/browse; the same hard
  // page deadline still bounds a cold lookup.
  // Once the archive has answered definitively, a past-dated slug cannot be
  // recovered by `live`: that reader's provider adapters discard events whose
  // start is before now. Keep unified in the race for ongoing multi-day rows
  // and ingested for retained historical occurrences, but do not make an old
  // shared link pay for a countywide live-feed fanout that cannot match it.
  // An archive timeout/error deliberately keeps the original all-source path,
  // so unavailable durable storage is never disguised as a 404.
  const pastDatedLookup =
    archive.status === "miss" && isPastDatedEventSlug(slug, now);
  const directSources: readonly DirectEventSource[] =
    pastDatedLookup
      ? ["unified", "ingested"]
      : ["unified", "live", "ingested"];

  for (const source of directSources) {
    if (Date.now() >= deadline || controller.signal.aborted) break;
    pending.set(
      source,
      eventLookup(() =>
        source === "unified"
          ? sources.unified(slug, now, context)
          : sources[source](slug, context),
      ).then((outcome) => ({
        source,
        outcome,
      })),
    );
  }

  while (pending.size > 0) {
    const settled = await settleBeforeDeadline(
      Promise.race(pending.values()),
      deadline,
    );
    if (settled === LOOKUP_TIMEOUT) {
      timedOut.push(...pending.keys());
      controller.abort();
      break;
    }
    pending.delete(settled.source);
    if (settled.outcome.status === "hit") {
      controller.abort();
      const event = await persistWinner(
        settled.outcome.event,
        slug,
        sources,
      );
      return { event, kind: settled.source };
    }
    if (settled.outcome.status === "error") {
      failed.push(settled.source);
    }
  }
  controller.abort();

  // A degraded unified miss already proves the optimized past lookup is
  // incomplete. If the independent ingested read also hangs, report the known
  // unavailable state rather than letting timeout precedence obscure it. A
  // hit above still wins, and archive failures never enter this branch.
  if (pastDatedLookup && failed.length > 0) {
    throw new EventResolutionUnavailableError([...new Set(failed)]);
  }
  if (timedOut.length > 0) {
    throw new EventResolutionTimeoutError([...new Set(timedOut)]);
  }
  if (failed.length > 0) {
    throw new EventResolutionUnavailableError([...new Set(failed)]);
  }
  return null;
}

async function resolveEventPageBySlugUncached(
  slug: string,
  now: Date = new Date(),
): Promise<ResolvedEventPage | null> {
  return resolveEventPageBySlugWithSources(
    slug,
    now,
    PRODUCTION_PAGE_SOURCES,
  );
}

async function resolveEventMetadataBySlugUncached(
  slug: string,
): Promise<ResolvedEventPage | null> {
  return resolveEventMetadataBySlugWithSources(slug, DEFAULT_SOURCES);
}

// Page-body lookups are memoized within a render so downstream page work does
// not repeat the same live resolution.
export const resolveEventPageBySlug = cache(resolveEventPageBySlugUncached);
// Metadata has a deliberately smaller dependency graph than the page body.
// Keep its request memo separate so a safe metadata miss cannot mask a later
// live hit, and a live lookup rejection cannot poison document metadata.
export const resolveEventMetadataBySlug = cache(
  resolveEventMetadataBySlugUncached,
);
