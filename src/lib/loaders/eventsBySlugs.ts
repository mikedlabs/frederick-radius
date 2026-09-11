/**
 * eventsBySlugs — batch hydration for the event slugs a device has saved.
 *
 * Saved is the only surface that begins from slugs the reader chose rather
 * than from a board the server assembled, and it used to resolve those slugs
 * against EVENT_BY_SLUG: the ~30 hand-authored seed rows in src/data/events.ts.
 * Ingested and live slugs are namespaced precisely so they can never collide
 * with a seed slug, so every event saved from a real feed resolved to
 * undefined and was filtered out one line later. The save wrote, the card
 * never came back, and nothing anywhere reported an error.
 *
 * This mirrors placesBySlugs: a small reader-selected slug set in, a slim
 * record set out, unknown slugs quietly dropped so one stale save cannot pin
 * the caller on a loading state forever.
 *
 * It is deliberately NOT resolveEventPageBySlug called in a loop. That
 * resolver races four sources under a four-second deadline because a deep
 * link must never false-404 — the right contract for one URL and the wrong
 * one for twenty. Here one public-board assembly answers the whole batch, and
 * only the leftovers (a past event the live board no longer carries) pay for
 * one durable-archive batch read under one shared deadline.
 */
import type { EventWithMeta } from "@/lib/loaders/events";
import { getEventBySlug } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import {
  archivedEventsBySlugs,
  type ArchivedEventBatchResolution,
} from "@/lib/events/event-identity";
import { isPublicEvent } from "@/lib/events/classify";
import { isUpcomingEvent } from "@/lib/events/visible";
import { MAX_EVENTS_BY_SLUG } from "@/lib/events/eventSlugBatch";
export {
  MAX_EVENTS_BY_SLUG,
  normalizeRequestedEventSlugList,
  normalizeRequestedEventSlugs,
} from "@/lib/events/eventSlugBatch";

/**
 * Total budget for the archive tail of one batch. A reader with a long
 * history of past saves must not turn Saved into a slow page: whatever the
 * archive has not returned by here is dropped for this request and resolves
 * on the next one, when the fetch cache is warm.
 */
export const EVENTS_BY_SLUG_ARCHIVE_BUDGET_MS = 3_000;

export type EventsBySlugsSources = {
  /** In-memory curated rows. Free, so it runs first and for every slug. */
  seed: (slug: string) => EventWithMeta | null;
  /** One assembly for the whole batch — only rows public discovery publishes. */
  publicEvents: (
    now: Date,
  ) => Promise<
    | readonly EventWithMeta[]
    | { events: readonly EventWithMeta[]; degraded: boolean }
  >;
  /** One durable archive read for every saved event the live board moved past. */
  archive: (
    slugs: readonly string[],
    timeoutMs: number,
  ) => Promise<ArchivedEventBatchResolution>;
};

const DEFAULT_SOURCES: EventsBySlugsSources = {
  seed: (slug) => getEventBySlug(slug),
  // A supplied slug is not authorization. This anonymous route may hydrate
  // only the same rows that public discovery is allowed to publish.
  publicEvents: async (now) => {
    const assembled = await assembleUnifiedEvents(now);
    return {
      events: assembled.publicEvents,
      degraded: assembled.sourceHealth.degraded,
    };
  },
  archive: (slugs, timeoutMs) =>
    archivedEventsBySlugs(slugs, { timeoutMs }),
};

/**
 * Reapply the public/actionable contract at this anonymous read boundary.
 * That keeps a seed or archive regression from disclosing a private/civic row
 * to anyone who guesses its slug. Ended, cancelled, postponed, and dead-end
 * online events are no longer actionable and therefore do not hydrate.
 */
function canHydratePublicEvent(event: EventWithMeta, now: Date): boolean {
  return isPublicEvent(event) && isUpcomingEvent(event, now);
}

export type EventsBySlugsResolution = {
  /** Renderable rows in the reader's requested order. */
  events: EventWithMeta[];
  /** Requested alias to canonical route for each renderable row. */
  resolvedSlugs: Array<{ requestedSlug: string; canonicalSlug: string }>;
  /** Slugs no source could answer because at least one required read degraded. */
  unresolvedSlugs: string[];
  /** Slugs a healthy public read and archive cannot publicly render. */
  missingSlugs: string[];
  /** True when any source needed for this batch returned partial data or failed. */
  degraded: boolean;
};

/**
 * Resolve saved event slugs and retain the trust state of every miss.
 *
 * A saved slug is only `missing` when both the public source set was healthy
 * and the durable archive completed normally. A partial feed, archive error,
 * or exhausted batch budget produces `unresolved` instead. That distinction is
 * important on Saved: a provider outage must never look like Radius discarded
 * something the reader deliberately kept.
 */
export async function resolveEventsBySlugsWithStatus(
  slugs: readonly string[],
  now: Date = new Date(),
  sources: EventsBySlugsSources = DEFAULT_SOURCES,
): Promise<EventsBySlugsResolution> {
  const requested = slugs.slice(0, MAX_EVENTS_BY_SLUG);
  if (requested.length === 0) {
    return {
      events: [],
      resolvedSlugs: [],
      unresolvedSlugs: [],
      missingSlugs: [],
      degraded: false,
    };
  }

  const resolved = new Map<string, EventWithMeta>();
  const canonicalByRequested = new Map<string, string>();
  let publicDegraded = false;
  let archiveDegraded = false;
  const archiveKnownAbsent = new Set<string>();
  const nonPublic = new Set<string>();
  const archiveUnresolved = new Set<string>();

  for (const slug of requested) {
    try {
      const seed = sources.seed(slug);
      if (seed && canHydratePublicEvent(seed, now)) {
        resolved.set(slug, seed);
        canonicalByRequested.set(slug, seed.slug);
      } else if (seed) {
        nonPublic.add(slug);
      }
    } catch {
      // A curated row that cannot decorate is a data bug, not a reason to
      // drop the other saves in this batch.
    }
  }

  const missingAfterSeed = requested.filter((slug) => !resolved.has(slug));
  if (missingAfterSeed.length > 0) {
    try {
      const snapshot = await sources.publicEvents(now);
      const status = Array.isArray(snapshot)
        ? { events: snapshot as readonly EventWithMeta[], degraded: false }
        : (snapshot as {
            events: readonly EventWithMeta[];
            degraded: boolean;
          });
      const publicEvents = status.events;
      publicDegraded = status.degraded;
      const wanted = new Set(missingAfterSeed);
      for (const event of publicEvents) {
        if (!wanted.has(event.slug)) continue;
        if (canHydratePublicEvent(event, now)) {
          resolved.set(event.slug, event);
          canonicalByRequested.set(event.slug, event.slug);
        } else {
          nonPublic.add(event.slug);
        }
      }
    } catch {
      // The archive may still resolve a durable row, but an archive miss cannot
      // prove absence while the public source set is unavailable.
      publicDegraded = true;
    }
  }

  const missingAfterUnified = requested.filter((slug) => !resolved.has(slug));
  if (missingAfterUnified.length > 0) {
    try {
      const archived = await sources.archive(
        missingAfterUnified,
        EVENTS_BY_SLUG_ARCHIVE_BUDGET_MS,
      );
      const wanted = new Set(missingAfterUnified);
      for (const hit of archived.matches) {
        if (!wanted.has(hit.requestedSlug)) continue;
        if (hit.tombstoned || !canHydratePublicEvent(hit.event, now)) {
          // We know this row is not public/actionable. Record only its absence;
          // never return title, location, or any other archived details.
          nonPublic.add(hit.requestedSlug);
          continue;
        }
        resolved.set(hit.requestedSlug, hit.event);
        canonicalByRequested.set(hit.requestedSlug, hit.canonicalSlug);
      }
      for (const slug of archived.unresolvedSlugs) {
        if (wanted.has(slug) && !resolved.has(slug)) {
          archiveUnresolved.add(slug);
        }
      }
      archiveDegraded = archiveUnresolved.size > 0;
      for (const slug of missingAfterUnified) {
        if (
          !resolved.has(slug) &&
          !nonPublic.has(slug) &&
          !archiveUnresolved.has(slug)
        ) {
          archiveKnownAbsent.add(slug);
        }
      }
    } catch {
      // One failed batch leaves every unmatched save unresolved. It never
      // retries per slug, so a provider outage cannot amplify database work.
      archiveDegraded = true;
      for (const slug of missingAfterUnified) archiveUnresolved.add(slug);
    }
  }

  // Requested order, so the client's own saved_at sort stays authoritative
  // and a hydration reshuffle can never move a card under the reader's thumb.
  const events = requested
    .map((slug) => resolved.get(slug))
    .filter((event): event is EventWithMeta => Boolean(event));
  const resolvedSlugs = requested.flatMap((requestedSlug) => {
    const event = resolved.get(requestedSlug);
    if (!event) return [];
    return [{
      requestedSlug,
      canonicalSlug: canonicalByRequested.get(requestedSlug) ?? event.slug,
    }];
  });
  const stillMissing = requested.filter((slug) => !resolved.has(slug));
  const missingSlugs = stillMissing.filter(
    (slug) =>
      nonPublic.has(slug) ||
      (!publicDegraded &&
        archiveKnownAbsent.has(slug) &&
        !archiveUnresolved.has(slug)),
  );
  const knownMissing = new Set(missingSlugs);
  const unresolvedSlugs = stillMissing.filter((slug) => !knownMissing.has(slug));

  return {
    events,
    resolvedSlugs,
    unresolvedSlugs,
    missingSlugs,
    degraded: publicDegraded || archiveDegraded || unresolvedSlugs.length > 0,
  };
}

/**
 * Compatibility reader for callers that only need renderable rows. New Saved
 * hydration uses `resolveEventsBySlugsWithStatus` so it can keep ambiguous
 * misses distinct from confirmed absence.
 */
export async function resolveEventsBySlugs(
  slugs: readonly string[],
  now: Date = new Date(),
  sources: EventsBySlugsSources = DEFAULT_SOURCES,
): Promise<EventWithMeta[]> {
  return (await resolveEventsBySlugsWithStatus(slugs, now, sources)).events;
}
