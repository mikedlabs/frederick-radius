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
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import { collapseRecurringEvents } from "@/lib/events/normalize";
import { venueEventsAsCards } from "@/lib/loaders/venueEvents";
import { withVenueThumbs } from "@/lib/loaders/eventThumb";
import { isPublicEvent } from "@/lib/events/classify";
import { hasImplausibleStartTime } from "@/lib/events/visible";

export type UnifiedEvents = {
  /** Full deduplicated set, BEFORE public/civic laning (the /events page
   *  derives its civic + reminder lanes from this). */
  unified: EventWithMeta[];
  /** isPublicEvent-filtered: what discovery surfaces may count + show. */
  publicEvents: EventWithMeta[];
};

export async function assembleUnifiedEvents(now: Date): Promise<UnifiedEvents> {
  const curatedUpcoming = allUpcoming(now);

  const [{ events: liveEventsRaw }, tmMusic, tmSports, bitEvents, sgEvents] = await Promise.all([
    getLiveEvents(60).catch(() => ({
      events: [] as Awaited<ReturnType<typeof getLiveEvents>>["events"],
    })),
    fetchTicketmasterMusic().catch(() => []),
    fetchTicketmasterSports().catch(() => []),
    fetchBandsintownForArtists([]).catch(() => []),
    // SeatGeek area discovery (Phase 4 item 3): inert without
    // SEATGEEK_CLIENT_ID, fail-soft like the others.
    fetchSeatGeek().catch(() => []),
  ]);

  // Live/county + music + sports feeds, curated duplicates dropped.
  const liveCards = dedupeLiveAgainstCurated(
    collapseRecurringEvents(
      [...liveEventsRaw, ...tmMusic, ...tmSports, ...bitEvents, ...sgEvents].map(liveToCardEvent),
    ),
    curatedUpcoming,
  );

  // Extracted venue lineups (The Banyan, Sky Stage, …) folded into the
  // same feed so a venue with a band tonight reads as an event.
  const venueCards = venueEventsAsCards(now);

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
