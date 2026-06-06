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
import { cleanFeedText, formatAddress } from "@/lib/format/text";
import { normalizeTitle, etYear, cleanEventSlug } from "@/lib/events/normalize";
import { eventGeoConfidence } from "@/lib/events/geo-confidence";

/**
 * The one clean-slug authority for a live event. Both liveToCardEvent
 * (the slug it stamps on the card) and getLiveCardEventBySlug (the
 * resolver) call this, so the link a card emits is exactly the link the
 * detail route resolves. Form: kebab(presenter + title)-YYYY-MM-DD, no
 * "live-" prefix, no mashed address, no timestamp.
 */
export function liveCleanSlug(e: Pick<LiveEvent, "title" | "starts_at">): string {
  const { presenter, title } = normalizeTitle(e.title, { year: etYear(e.starts_at) });
  return cleanEventSlug({ presenter, title, startsAt: e.starts_at });
}

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
  // Normalize feed strings at this boundary, never in the card. Title
  // gets entity-decoded, presenter-split, and hyphen/year-cleaned;
  // venue and address get decoded; the address also gets its
  // suffix-into-city concatenation repaired.
  const { presenter, title } = normalizeTitle(e.title, { year: etYear(e.starts_at) });
  return {
    // Clean, shareable slug (Phase 2). The legacy liveEventSlug is kept
    // only as a fallback resolver for old shared links.
    slug: liveCleanSlug(e),
    title,
    presenter,
    description: cleanFeedText(e.description ?? ""),
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    timezone: "America/New_York",
    is_all_day: false,
    is_recurring: false,
    venue_name: cleanFeedText(e.venue_name ?? ""),
    address: formatAddress(cleanFeedText(e.address ?? "")),
    geom: e.geom,
    municipality: e.municipality,
    category: e.category,
    audience: [],
    is_free: e.is_free,
    organizer: e.organizer,
    status: e.status,
    source: "manual",
    source_url: e.url,
    is_verified: false,
    last_verified_at: e.last_verified_at,
    category_name: CATEGORY_BY_SLUG[e.category]?.name ?? e.category,
    municipality_name: MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? e.municipality,
    distance_m: undefined,
    // Live feeds carry no per-event geocode — every row sits on its feed's
    // default centroid, so this resolves to "area" and never claims a
    // distance. See lib/events/geo-confidence.
    geo_confidence: eventGeoConfidence({ geom: e.geom }),
  };
}

/**
 * Resolve a single live event by slug, for the detail route. Tries the
 * clean stored slug first, then the legacy "live-..." slug as a
 * fallback. Returns null when nothing matches or the event has left the
 * feed window. The detail route resolves seed events first, so this only
 * runs when the seed lookup missed; a clean live slug looks like a seed
 * slug, so the old "starts-with-live-" fast path is gone and any
 * unmatched slug now consults the (cached) feed.
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
  const { events } = await getLiveEvents(windowDays);
  // Clean stored slug first (the canonical form a card links to).
  let hit = events.find((e) => liveCleanSlug(e) === slug);
  // Legacy fallback: an old "live-..." shared link still resolves so it
  // never 404s. The detail route notices the slug mismatch and redirects
  // the visitor to the clean URL.
  if (!hit && slug.startsWith("live-")) {
    hit = events.find((e) => liveEventSlug(e) === slug);
  }
  return hit ? liveToCardEvent(hit) : null;
}
