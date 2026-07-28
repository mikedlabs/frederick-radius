import type { EventWithMeta } from "@/lib/loaders/events";
import { getEventBySlug } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { getLiveCardEventBySlug } from "@/lib/loaders/liveEvents";
import { getIngestedCardBySlug } from "@/lib/loaders/ingestedEvents";
import { hasActionableAttendance } from "@/lib/events/attendance";
import { cache } from "react";

export type EventResolutionKind = "seed" | "unified" | "live" | "ingested";

export type ResolvedEventPage = {
  event: EventWithMeta;
  kind: EventResolutionKind;
};

type EventResolverSources = {
  seed: (slug: string) => EventWithMeta | null;
  unified: (now: Date) => Promise<EventWithMeta[]>;
  live: (slug: string) => Promise<EventWithMeta | null>;
  ingested: (slug: string) => Promise<EventWithMeta | null>;
};

const DEFAULT_SOURCES: EventResolverSources = {
  seed: getEventBySlug,
  unified: async (now) => (await assembleUnifiedEvents(now)).publicEvents,
  live: getLiveCardEventBySlug,
  ingested: getIngestedCardBySlug,
};

export const EVENT_DEEP_LINK_TIMEOUT_MS = 2_500;
const UNIFIED_HEAD_START_MS = 500;

type AsyncEventSource = Exclude<EventResolutionKind, "seed">;

type EventLookupOutcome =
  | { status: "hit"; event: EventWithMeta }
  | { status: "miss" }
  | { status: "error"; error: unknown };

const LOOKUP_TIMEOUT = Symbol("event-lookup-timeout");

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

function eventLookup(
  lookup: () => Promise<EventWithMeta | EventWithMeta[] | null>,
  slug: string,
): Promise<EventLookupOutcome> {
  // Install both fulfillment and rejection handlers before the shared timeout
  // can win. If a provider rejects later, that rejection is still consumed
  // instead of becoming an unhandled rejection after the request has ended.
  return Promise.resolve()
    .then(lookup)
    .then(
      (value): EventLookupOutcome => {
        const candidate = Array.isArray(value)
          ? value.find((event) => event.slug === slug) ?? null
          : value;
        return candidate && hasActionableAttendance(candidate)
          ? { status: "hit", event: candidate }
          : { status: "miss" };
      },
      (error): EventLookupOutcome => ({ status: "error", error }),
    );
}

async function settleBeforeDeadline(
  lookup: Promise<EventLookupOutcome>,
  deadline: number,
): Promise<EventLookupOutcome | typeof LOOKUP_TIMEOUT> {
  if (deadline <= Date.now()) {
    // An already-settled lookup is queued before this resolved timeout marker;
    // a still-pending lookup loses immediately without adding another timer
    // turn beyond the shared request budget.
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

/**
 * Resolve the event-detail page from the same cached public set that emitted
 * its link before consulting any source-specific fallback.
 *
 * This ordering is load-bearing. The event sheet and event-list surfaces read
 * assembleUnifiedEvents, while the old detail route rebuilt seven upstream
 * feeds with independent six-second deadlines. A cold or slow provider could
 * therefore make a card visible and its "See full page" link return a
 * temporary 404. The stable unified snapshot is now the first live lookup, so
 * every event currently visible in the app remains resolvable even while an
 * upstream refresh is degraded. The 90-day live and ingested resolvers remain
 * as fallbacks for older shared links that have left the current list window.
 */
export async function resolveEventPageBySlugWithSources(
  slug: string,
  now: Date,
  sources: EventResolverSources,
): Promise<ResolvedEventPage | null> {
  const seed = sources.seed(slug);
  if (seed && hasActionableAttendance(seed)) return { event: seed, kind: "seed" };

  // Give the stable unified snapshot a brief head start. A warm cache hit
  // returns without launching source-specific work; a miss or slow cache
  // launches both useful fallbacks once, in parallel, under the same deadline.
  const deadline = Date.now() + EVENT_DEEP_LINK_TIMEOUT_MS;
  const unifiedLookup = eventLookup(() => sources.unified(now), slug);
  const timedOut: AsyncEventSource[] = [];
  const failed: AsyncEventSource[] = [];

  let unifiedOutcome = await settleBeforeDeadline(
    unifiedLookup,
    Math.min(deadline, Date.now() + UNIFIED_HEAD_START_MS),
  );
  if (unifiedOutcome !== LOOKUP_TIMEOUT) {
    if (unifiedOutcome.status === "hit") {
      return { event: unifiedOutcome.event, kind: "unified" };
    }
    if (unifiedOutcome.status === "error") failed.push("unified");
  }

  const fallbackLookups = {
    live: eventLookup(() => sources.live(slug), slug),
    ingested: eventLookup(() => sources.ingested(slug), slug),
  };

  // If the head start expired, keep the original unified lookup alive while
  // the fallbacks run. This preserves unified priority when it finishes inside
  // the overall budget without invoking that provider a second time.
  if (unifiedOutcome === LOOKUP_TIMEOUT) {
    unifiedOutcome = await settleBeforeDeadline(unifiedLookup, deadline);
    if (unifiedOutcome === LOOKUP_TIMEOUT) {
      timedOut.push("unified");
    } else if (unifiedOutcome.status === "hit") {
      return { event: unifiedOutcome.event, kind: "unified" };
    } else if (unifiedOutcome.status === "error") {
      failed.push("unified");
    }
  }

  for (const kind of ["live", "ingested"] as const) {
    const outcome = await settleBeforeDeadline(fallbackLookups[kind], deadline);
    if (outcome === LOOKUP_TIMEOUT) {
      timedOut.push(kind);
      continue;
    }
    if (outcome.status === "hit") {
      return { event: outcome.event, kind };
    }
    if (outcome.status === "error") {
      failed.push(kind);
    }
  }

  // A 404 is reserved for a definitive miss from every source. A timeout or
  // provider failure is transient and must reach Next's error path instead of
  // permanently telling crawlers and users that a slow, valid event is gone.
  if (timedOut.length > 0) {
    throw new EventResolutionTimeoutError(timedOut);
  }
  if (failed.length > 0) {
    throw new EventResolutionUnavailableError(failed);
  }

  return null;
}

async function resolveEventPageBySlugUncached(
  slug: string,
  now: Date = new Date(),
): Promise<ResolvedEventPage | null> {
  return resolveEventPageBySlugWithSources(slug, now, DEFAULT_SOURCES);
}

// generateMetadata and the page body both resolve the same slug during one
// render. React's request-scoped cache keeps that from rebuilding the event
// source union twice; the pure resolver above remains directly testable.
export const resolveEventPageBySlug = cache(resolveEventPageBySlugUncached);
