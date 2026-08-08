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
 * one for twenty. Here a single unified assembly answers the whole batch, and
 * only the leftovers (a past event the live board no longer carries) pay for
 * a durable-archive read, under one shared budget with bounded concurrency.
 */
import type { EventWithMeta } from "@/lib/loaders/events";
import { getEventBySlug } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { archivedEventBySlugForRender } from "@/lib/events/event-archive-lookup";
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

/** Per-slug ceiling inside the shared budget, so one cold read cannot eat it. */
export const EVENTS_BY_SLUG_ARCHIVE_SLICE_MS = 1_500;

/** Concurrent archive reads. Enough to drain a normal tail in one wave
 *  without opening a connection per saved event. */
const ARCHIVE_CONCURRENCY = 6;

export type EventsBySlugsSources = {
  /** In-memory curated rows. Free, so it runs first and for every slug. */
  seed: (slug: string) => EventWithMeta | null;
  /** One assembly for the whole batch — the same set the board publishes. */
  unified: (now: Date) => Promise<readonly EventWithMeta[]>;
  /** Durable archive, for a saved event the live board has moved past. */
  archive: (
    slug: string,
    timeoutMs: number,
  ) => Promise<{ event: EventWithMeta } | null>;
  now: () => number;
};

const DEFAULT_SOURCES: EventsBySlugsSources = {
  seed: (slug) => getEventBySlug(slug),
  // The full unified set, not publicEvents. Public/civic laning decides what
  // discovery may PROMOTE; it has no business deciding whether a reader gets
  // back a row they deliberately saved. The slug set is the authorization.
  unified: async (now) => (await assembleUnifiedEvents(now)).unified,
  archive: (slug, timeoutMs) =>
    archivedEventBySlugForRender(slug, { timeoutMs }),
  now: () => Date.now(),
};

/** Run `work` over `items` at most `limit` at a time, in place. */
async function drain<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await work(item);
      }
    },
  );
  await Promise.all(runners);
}

/**
 * Resolve saved event slugs to renderable rows, in the order requested.
 *
 * Every failure mode collapses to "this slug is absent". A degraded provider,
 * an unreachable archive, and a genuinely deleted event are indistinguishable
 * to the caller ON PURPOSE: Saved renders what it can and says nothing it
 * cannot support, and the next request retries the rest. That is the opposite
 * of the deep-link contract, where an ambiguous miss must never become a 404.
 */
export async function resolveEventsBySlugs(
  slugs: readonly string[],
  now: Date = new Date(),
  sources: EventsBySlugsSources = DEFAULT_SOURCES,
): Promise<EventWithMeta[]> {
  const requested = slugs.slice(0, MAX_EVENTS_BY_SLUG);
  if (requested.length === 0) return [];

  const resolved = new Map<string, EventWithMeta>();

  for (const slug of requested) {
    try {
      const seed = sources.seed(slug);
      if (seed) resolved.set(slug, seed);
    } catch {
      // A curated row that cannot decorate is a data bug, not a reason to
      // drop the other saves in this batch.
    }
  }

  const missingAfterSeed = requested.filter((slug) => !resolved.has(slug));
  if (missingAfterSeed.length > 0) {
    try {
      const unified = await sources.unified(now);
      const wanted = new Set(missingAfterSeed);
      for (const event of unified) {
        if (wanted.has(event.slug)) resolved.set(event.slug, event);
      }
    } catch {
      // A degraded snapshot still leaves the archive pass below, and any slug
      // neither source answers simply does not render this time.
    }
  }

  const missingAfterUnified = requested.filter((slug) => !resolved.has(slug));
  if (missingAfterUnified.length > 0) {
    const deadline = sources.now() + EVENTS_BY_SLUG_ARCHIVE_BUDGET_MS;
    await drain(missingAfterUnified, ARCHIVE_CONCURRENCY, async (slug) => {
      const remaining = deadline - sources.now();
      if (remaining <= 0) return;
      try {
        const hit = await sources.archive(
          slug,
          Math.min(remaining, EVENTS_BY_SLUG_ARCHIVE_SLICE_MS),
        );
        if (hit) resolved.set(slug, hit.event);
      } catch {
        // Archive unavailable for this slug. Absent, not fatal.
      }
    });
  }

  // Requested order, so the client's own saved_at sort stays authoritative
  // and a hydration reshuffle can never move a card under the reader's thumb.
  return requested
    .map((slug) => resolved.get(slug))
    .filter((event): event is EventWithMeta => Boolean(event));
}
