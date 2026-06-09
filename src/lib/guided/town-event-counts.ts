import { unstable_cache } from "next/cache";
import {
  allUpcoming,
  dedupeLiveAgainstCurated,
  type EventWithMeta,
} from "@/lib/loaders/events";
import { isPublicEvent } from "@/lib/events/classify";
import { getLiveEvents } from "@/lib/integrations/ical-live";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import { venueEventsAsCards } from "@/lib/loaders/venueEvents";
import { collapseRecurringEvents } from "@/lib/events/normalize";

/**
 * Per-municipality "what's on this week" counts for the town cards.
 *
 * The town picker used to count from `allUpcoming` (the curated seed set
 * ONLY), so a town whose only events came from a live feed read "No events
 * this week" even though /events listed a farmers market there — the audit's
 * "the towns page looks dead when the county is not" bug.
 *
 * This counts from the SAME sources /events unifies — curated + the live
 * county/municipal iCal feeds (where town farmers markets, markets and the
 * like live) + scraped venue lineups — deduped the same way, classified so
 * only PUBLIC events count (meetings/rentals are laned out, never inflate a
 * town's "what's on"), within the next 7 days, grouped by the event's
 * inferred municipality.
 *
 * Deliberately NOT pulling the Ticketmaster/Bandsintown music feeds: those
 * are venue concerts that resolve to Frederick and would only add fetch cost
 * + a small Frederick over-count, never affect the smaller towns this fixes.
 * Cached (revalidate hourly, tagged "events") so /towns never pays the live
 * fetch on a normal render.
 */
async function buildWeeklyPublicEventCounts(): Promise<Record<string, number>> {
  const now = new Date();
  const weekEndMs = now.getTime() + 7 * 86_400_000;

  const curatedUpcoming = allUpcoming(now);
  const venueCards = venueEventsAsCards(now);
  const { events: liveRaw } = await getLiveEvents(60).catch(() => ({
    events: [] as Awaited<ReturnType<typeof getLiveEvents>>["events"],
  }));
  // Same boundary mapping + dedup against curated that /events does.
  const liveCards = dedupeLiveAgainstCurated(
    collapseRecurringEvents(liveRaw.map(liveToCardEvent)),
    curatedUpcoming,
  );

  // One set, deduped by slug (mirrors the /events unified map).
  const bySlug = new Map<string, EventWithMeta>();
  for (const e of [...curatedUpcoming, ...liveCards, ...venueCards]) {
    if (!bySlug.has(e.slug)) bySlug.set(e.slug, e);
  }

  const counts: Record<string, number> = {};
  for (const e of bySlug.values()) {
    // Only PUBLIC events are "what's on" — meetings, town reminders and
    // private rentals are laned out so a council meeting never reads as a
    // thing to do this week.
    if (!isPublicEvent(e)) continue;
    const t = Date.parse(e.starts_at);
    if (!Number.isFinite(t) || t < now.getTime() - 3_600_000 || t > weekEndMs) {
      continue;
    }
    const muni = e.municipality;
    if (muni) counts[muni] = (counts[muni] ?? 0) + 1;
  }
  return counts;
}

/**
 * Cached `{ municipalitySlug: thisWeekPublicEventCount }`. The cache key is
 * pinned to the deploy SHA and revalidates hourly; tagged "events" so an
 * events refresh flips it alongside the other event surfaces.
 */
export const getWeeklyPublicEventCountsByMunicipality = unstable_cache(
  buildWeeklyPublicEventCounts,
  ["town-event-counts", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 3600, tags: ["events"] },
);
