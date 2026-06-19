/**
 * THE one assembly of the county's public event set — curated seeds +
 * live feeds (iCal municipal/celebrate/county + Ticketmaster music/sports
 * + Bandsintown) + extracted venue lineups, deduplicated, collapsed,
 * thumb-decorated, and classified.
 *
 * Lifted verbatim from /events' inline assembly (June-9 deep audit P0-5):
 * /today counted ONLY curated seeds for its "This weekend" chip while
 * /events counted this full set, so the two surfaces told the user "1"
 * and "13" for the same weekend. Both pages now call this function, so
 * the numbers cannot diverge again — one query, one truth.
 *
 * Server-only (live fetches). Every async source is fail-soft: a hung or
 * throwing provider degrades to its empty bucket and the result still
 * assembles from curated data. All feed fetches are HTTP-cached upstream
 * (next.revalidate), so concurrent /today + /events renders share cache
 * entries rather than re-fetching.
 */
import {
  allUpcoming,
  dedupeLiveAgainstCurated,
  dedupeCuratedClusters,
  type EventWithMeta,
} from "@/lib/loaders/events";
import { getLiveEvents } from "@/lib/integrations/ical-live";
import {
  fetchTicketmasterMusic,
  fetchTicketmasterSports,
} from "@/lib/integrations/ticketmaster";
import { fetchBandsintownForArtists } from "@/lib/integrations/bandsintown";
import { fetchSeatGeek } from "@/lib/integrations/seatgeek";
import { fetchEventbrite } from "@/lib/integrations/eventbrite";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import { collapseRecurringEvents } from "@/lib/events/normalize";
import { venueEventsAsCards, venueEventsToCards } from "@/lib/loaders/venueEvents";
import { fetchSquarespaceVenueEvents } from "@/lib/integrations/squarespace-live";
import { withVenueThumbs } from "@/lib/loaders/eventThumb";
import { isPublicEvent } from "@/lib/events/classify";
import { hasImplausibleStartTime } from "@/lib/events/visible";
import { unstable_cache } from "next/cache";

export type UnifiedEvents = {
  /** Full deduplicated set, BEFORE public/civic laning (the /events page
   *  derives its civic + reminder lanes from this). */
  unified: EventWithMeta[];
  /** isPublicEvent-filtered: what discovery surfaces may count + show. */
  publicEvents: EventWithMeta[];
};

async function assembleRaw(now: Date): Promise<UnifiedEvents> {
  const curatedUpcoming = allUpcoming(now);

  const [{ events: liveEventsRaw }, tmMusic, tmSports, bitEvents, sgEvents, ebEvents, squarespaceRaw] = await Promise.all([
    getLiveEvents(60).catch(() => ({
      events: [] as Awaited<ReturnType<typeof getLiveEvents>>["events"],
    })),
    fetchTicketmasterMusic().catch(() => []),
    fetchTicketmasterSports().catch(() => []),
    fetchBandsintownForArtists([]).catch(() => []),
    // SeatGeek area discovery (Phase 4 item 3): inert without
    // SEATGEEK_CLIENT_ID, fail-soft like the others.
    fetchSeatGeek().catch(() => []),
    // Eventbrite organizer registry (Phase 4 item 4): inert without
    // EVENTBRITE_TOKEN or an empty registry.
    fetchEventbrite().catch(() => []),
    // Squarespace venue lineups (The Banyan, …): runtime-fetched from each
    // venue's `?format=json` events feed. Inert ([]) until a venue carries a
    // `squarespace` URL in live-music-venues.ts.
    fetchSquarespaceVenueEvents(60).catch(() => []),
  ]);

  // Live/county + music + sports feeds, curated duplicates dropped.
  const liveCards = dedupeLiveAgainstCurated(
    collapseRecurringEvents(
      [...liveEventsRaw, ...tmMusic, ...tmSports, ...bitEvents, ...sgEvents, ...ebEvents].map(liveToCardEvent),
    ),
    curatedUpcoming,
  );

  // Extracted venue lineups folded into the same feed so a venue with a band
  // tonight reads as an event. Two sources, same EventWithMeta shape + shared
  // adapter: the committed venue-events.json snapshot, and the runtime
  // Squarespace `?format=json` lineups (The Banyan, …). The slug-keyed dedupe
  // below collapses any overlap between them.
  const venueCards = [...venueEventsAsCards(now), ...venueEventsToCards(squarespaceRaw)];

  // Time-sanity guard on FEED/EXTRACTED rows only (curated seeds are
  // hand-authored): a theater curtain at 7 AM is a parsing artifact —
  // withhold it rather than publish a wrong time (June-9 audit P1-11).
  const sane = (e: EventWithMeta) => !hasImplausibleStartTime(e);

  // One unified, deduplicated, time-sorted set; second-pass dedup catches
  // curated-vs-curated duplicates, keeping the richer record per cluster.
  const bySlug = new Map<string, EventWithMeta>();
  for (const e of [...curatedUpcoming, ...liveCards.filter(sane), ...venueCards.filter(sane)]) {
    if (!bySlug.has(e.slug)) bySlug.set(e.slug, e);
  }
  const unified = withVenueThumbs(
    dedupeCuratedClusters(
      [...bySlug.values()].sort(
        (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
      ),
    ),
  );

  return { unified, publicEvents: unified.filter(isPublicEvent) };
}

// Cache the whole assembly per 5-minute bucket so /today + /events stop paying
// the multi-feed fetch (~8s on a cold/uncached render) on EVERY request. The
// cached value is the same serializable EventWithMeta set the pages already
// ship across the RSC boundary to client components, so it round-trips
// through the data cache cleanly. `now` is rounded to a 300s bucket (the cache
// key), matching revalidate, so within a window every render is a HIT and the
// page is fast even though it renders dynamically. The pages still window the
// set against the REAL now (eventsForMode), so "tonight/weekend" stay exact.
// Bump "unified-events-v1" if the assembled shape changes (CLAUDE.md rule).
const cachedAssemble = unstable_cache(
  (bucket: number) => assembleRaw(new Date(bucket * 300_000)),
  ["unified-events-v3"],
  { revalidate: 300 },
);

export async function assembleUnifiedEvents(now: Date): Promise<UnifiedEvents> {
  return cachedAssemble(Math.floor(now.getTime() / 300_000));
}
