/**
 * Live-feed events adapted to the shared card/detail shape, plus a
 * by-slug resolver.
 *
 * Server-only: this pulls getLiveEvents (a network fetch over the iCal /
 * RSS sources) so it must never be imported into a client component.
 * Both the /events index and the /events/[slug] detail route import from
 * here, so a live event renders the same way in-app and a shared
 * /events/<slug> link resolves instead of hitting notFound().
 */
import { getLiveEvents, liveEventSlug, type LiveEvent } from "@/lib/integrations/ical-live";
import type { EventWithMeta } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * Adapt one live feed event to the EventWithMeta shape the card and
 * detail page consume. The slug is the deterministic liveEventSlug (not
 * the raw feed UID) so the same value the card links to and Share copies
 * can be resolved back by getLiveCardEventBySlug. source is "manual"
 * (matching the prior behaviour) but note that is NOT a reliable
 * live-vs-seed signal: many hand-authored seed events also use "manual".
 * The reliable signal is "did getEventBySlug resolve it" — the detail
 * route relies on that ordering, not on source.
 */
export function liveToCardEvent(e: LiveEvent): EventWithMeta {
  return {
    slug: liveEventSlug(e),
    title: e.title,
    description: e.description,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    timezone: "America/New_York",
    is_all_day: false,
    is_recurring: false,
    venue_name: e.venue_name,
    address: e.address,
    geom: e.geom,
    municipality: e.municipality,
    category: e.category,
    audience: [],
    is_free: e.is_free,
    organizer: e.organizer,
    source: "manual",
    source_url: e.url,
    is_verified: false,
    last_verified_at: e.last_verified_at,
    category_name: CATEGORY_BY_SLUG[e.category]?.name ?? e.category,
    municipality_name: MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? e.municipality,
    distance_m: undefined,
  };
}

/**
 * Resolve a single live event by its derived slug, for the detail route.
 * Returns null for any slug that is not a live slug (a fast path with no
 * network: seed events are resolved separately, and first) or that no
 * longer appears in the current feed window.
 *
 * Window is 90 days: a superset of the index's 60-day card window so a
 * link shared the moment a card appears still resolves. The underlying
 * feed fetch is HTTP-cached (next.revalidate 3600) and the request URL
 * is identical regardless of windowDays, so this shares the index's
 * cache entry rather than adding a round trip.
 */
export async function getLiveCardEventBySlug(
  slug: string,
  windowDays = 90,
): Promise<EventWithMeta | null> {
  if (!slug.startsWith("live-")) return null;
  const { events } = await getLiveEvents(windowDays);
  const hit = events.find((e) => liveEventSlug(e) === slug);
  return hit ? liveToCardEvent(hit) : null;
}
