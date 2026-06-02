import RAW from "@/data/venue-events.json" with { type: "json" };
import type { EventWithMeta } from "@/lib/loaders/events";
import { clientPlaces, clientPlaceBySlug } from "@/lib/loaders/places-client";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { FREDERICK_CENTER } from "@/lib/geo";
import { cleanFeedText, formatAddress } from "@/lib/format/text";
import { normalizeTitle, etYear, cleanEventSlug } from "@/lib/events/normalize";

/**
 * Venue events — produced by the extraction agent
 * (scripts/ingest-venue-events.ts) for venues whose lineups live only on
 * their own site (The Banyan, The Derby, Sky Stage…). Read side: feeds
 * the events surfaces + the "ask Frederick" answer engine. Each row
 * carries source + fetchedAt so the UI can show provenance + freshness.
 * Starts empty; never fabricated.
 */

export type VenueEvent = {
  title: string;
  starts_at: string;
  ends_at?: string;
  description?: string;
  price?: string;
  ticket_url?: string;
  venue_slug: string;
  venue_name: string;
  category?: string;
  source: { url: string; fetchedAt: string };
};

const DATA = RAW as unknown as VenueEvent[];

/** All ingested venue events. */
export function venueEvents(): VenueEvent[] {
  return DATA;
}

/** Future venue events, soonest first. */
export function upcomingVenueEvents(now: Date = new Date()): VenueEvent[] {
  const t = now.getTime();
  return DATA.filter((e) => {
    const ms = Date.parse(e.starts_at);
    return Number.isFinite(ms) && ms >= t - 3_600_000;
  }).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

const normLoose = (s: string): string => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Resolve a scraped venue to its place record. The ingest slug is often a
 * SHORTENED form ("weinberg-center") of the full place slug
 * ("weinberg-center-for-the-arts-frederick"), and the scraped name can
 * drop the town ("Weinberg Center for the Arts" vs the place's
 * "…Frederick"). The old exact-slug-only lookup missed those, so the
 * event lost both its venue's coordinates AND its borrowable photo — the
 * cause of venue events rendering as photoless cards on a US county app.
 * Try, in trust order: exact slug → a full slug that starts with the
 * ingest slug → an exact or prefix normalized-name match. Photo-bearing
 * candidates win ties so the card gets a real thumbnail when one exists.
 */
function resolveVenuePlace(slug: string, name: string): ReturnType<typeof clientPlaceBySlug> {
  const exact = clientPlaceBySlug(slug);
  if (exact) return exact;
  const all = clientPlaces();
  type VenueCandidate = { slug: string; google_photo_url?: string };
  const withPhotoFirst = (a: VenueCandidate, b: VenueCandidate) =>
    Number(Boolean(b.google_photo_url)) - Number(Boolean(a.google_photo_url)) ||
    a.slug.length - b.slug.length;
  const pref = slug.endsWith("-") ? slug : `${slug}-`;
  const byPrefix = all
    .filter((p) => p.slug === slug || p.slug.startsWith(pref))
    .sort(withPhotoFirst)[0];
  if (byPrefix) return byPrefix;
  const nk = normLoose(name);
  if (nk.length >= 5) {
    const byName = all
      .filter((p) => {
        const k = normLoose(p.name);
        return k === nk || k.startsWith(nk);
      })
      .sort(withPhotoFirst)[0];
    if (byName) return byName;
  }
  return undefined;
}

/**
 * Adapt one ingested venue event to the EventWithMeta shape the event
 * card, detail page, and the unified /events feed consume — the same
 * boundary normalization liveToCardEvent does for iCal/Ticketmaster
 * feeds. The venue's own place record (resolved by slug) supplies the
 * geo + address + municipality so the event sits correctly on the map
 * and in range/distance math; an unresolved venue falls back to the
 * downtown center so it still appears rather than vanishing.
 *
 * Without this, scraped venue lineups populate venue-events.json but
 * never reach a screen — the gap that made the "places + events fused"
 * wedge inert.
 */
function venueEventToCard(e: VenueEvent): EventWithMeta {
  const place = resolveVenuePlace(e.venue_slug, e.venue_name);
  const geom = place?.geom ?? FREDERICK_CENTER;
  const municipality = place?.municipality ?? "frederick";
  const category = e.category || place?.category || "music";
  const { presenter, title } = normalizeTitle(e.title, { year: etYear(e.starts_at) });
  const isFree = e.price ? /free|no cover/i.test(e.price) : false;
  return {
    slug: cleanEventSlug({ presenter, title, startsAt: e.starts_at }),
    title,
    presenter,
    description: cleanFeedText(e.description ?? ""),
    starts_at: e.starts_at,
    ends_at: e.ends_at ?? e.starts_at,
    timezone: "America/New_York",
    is_all_day: false,
    is_recurring: false,
    venue_place_slug: place?.slug,
    hero_image: place?.google_photo_url,
    venue_name: cleanFeedText(e.venue_name),
    address: formatAddress(cleanFeedText(place?.address ?? "")),
    geom,
    municipality,
    category,
    audience: [],
    is_free: isFree,
    price_text: e.price,
    ticket_url: e.ticket_url,
    source: "manual",
    source_url: e.source.url,
    is_verified: false,
    last_verified_at: e.source.fetchedAt,
    category_name: CATEGORY_BY_SLUG[category]?.name ?? category,
    municipality_name: MUNICIPALITY_BY_SLUG[municipality]?.name ?? municipality,
    distance_m: undefined,
  };
}

/**
 * Upcoming venue events as feed-ready cards. The /events page folds
 * these into its unified, deduped, time-sorted set so a venue with a
 * band tonight shows up alongside curated + live-feed events. Empty
 * until the agent runs; never fabricated.
 */
export function venueEventsAsCards(now: Date = new Date()): EventWithMeta[] {
  return upcomingVenueEvents(now).map(venueEventToCard);
}
