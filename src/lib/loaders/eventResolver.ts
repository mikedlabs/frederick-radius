import { cache } from "react";
import type { EventWithMeta } from "@/lib/loaders/events";
import { getEventBySlug } from "@/lib/loaders/events";
import { getLiveCardEventBySlug } from "@/lib/loaders/liveEvents";
import { getIngestedCardBySlug } from "@/lib/loaders/ingestedEvents";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { hasActionableAttendance } from "@/lib/events/attendance";
import { withVenueThumb } from "@/lib/loaders/eventThumb";
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
    return result.publicEvents.find((event) => event.slug === slug) ?? null;
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
  sources: EventResolverSources,
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
  for (const source of ["unified", "live", "ingested"] as const) {
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
  return resolveEventPageBySlugWithSources(slug, now, DEFAULT_SOURCES);
}

// Metadata and body resolve the same slug during one render.
export const resolveEventPageBySlug = cache(resolveEventPageBySlugUncached);
