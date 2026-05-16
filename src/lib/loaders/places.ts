import { PLACES, PLACE_BY_SLUG, type Place } from "@/data/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { eventsAtVenue, type Event } from "@/data/events";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { getOpenStatus, type OpenStatus } from "@/lib/hours";
import { isKnownClosed } from "@/lib/integrations/closures";
import ENRICHMENT_RAW from "@/data/places-enrichment.json" with { type: "json" };
import DEDUP_RAW from "@/data/places-dedup.json" with { type: "json" };

type DedupEntry = { canonical: string; merged?: { website?: string; phone?: string } };
const DEDUP = DEDUP_RAW as Record<string, DedupEntry>;
// Default off, so flags-off behavior is exactly today's production.
const DEDUPE_ON = process.env.RADIUS_DEDUPE === "1";

/**
 * Collapse fuzzy duplicates to one canonical record (curated wins) and
 * overlay unique website/phone the canonical was missing. Pure, so it
 * is unit tested. Identity when there is no dedup entry for a slug.
 */
export function applyDedup(list: Place[]): Place[] {
  return list
    .filter((p) => {
      const e = DEDUP[p.slug];
      return !e || e.canonical === p.slug; // drop folded duplicates
    })
    .map((p) => {
      const e = DEDUP[p.slug];
      if (!e?.merged) return p;
      return {
        ...p,
        website: p.website ?? e.merged.website,
        phone: p.phone ?? e.merged.phone,
      };
    });
}

const BASE_PLACES: Place[] = DEDUPE_ON ? applyDedup(PLACES) : PLACES;
const BASE_BY_SLUG: Record<string, Place> = DEDUPE_ON
  ? (() => {
      const byCanon: Record<string, Place> = {};
      for (const p of BASE_PLACES) byCanon[p.slug] = p;
      const idx: Record<string, Place> = { ...byCanon };
      // A folded slug resolves to its canonical so old links still work.
      for (const [slug, e] of Object.entries(DEDUP)) {
        if (byCanon[e.canonical]) idx[slug] = byCanon[e.canonical];
      }
      return idx;
    })()
  : PLACE_BY_SLUG;

type Enrichment = {
  business_status?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | "UNKNOWN";
  weekday_hours?: string[];
  has_hours?: boolean;
  rating?: number;
  user_rating_count?: number;
  photo_names?: string[];
  phone?: string;
  website?: string;
  enriched_at?: string;
};
const ENRICHMENT = ENRICHMENT_RAW as Record<string, Enrichment>;

/** Google-verified data merged onto a place, when available. */
export type PlaceEnriched = {
  /** Proxied photo URL (server route, key-safe) — first photo, for heroes */
  google_photo_url?: string;
  /** All proxied photo URLs (key-safe), for galleries */
  google_photos?: string[];
  google_rating?: number;
  google_rating_count?: number;
  /** Human-readable weekly hours from Google */
  google_hours?: string[];
  /** True once Google has verified this place */
  google_verified?: boolean;
};

const photoProxy = (name: string, w = 800) =>
  `/api/place-photo?name=${encodeURIComponent(name)}&w=${w}`;

export type PlaceCardData = Place & PlaceEnriched & {
  open_status: OpenStatus;
  distance_m?: number;
};

function applyEnrichment(p: Place): Place & PlaceEnriched {
  const e = ENRICHMENT[p.slug];
  if (!e) return p;
  // Google business_status overrides our seed guess — it's authoritative.
  const is_operational =
    e.business_status === "CLOSED_PERMANENTLY" ? "closed_permanently" :
    e.business_status === "CLOSED_TEMPORARILY" ? "closed_temporarily" :
    e.business_status === "OPERATIONAL" ? "operational" :
    p.is_operational;
  const photos = (e.photo_names ?? []).slice(0, 8);
  return {
    ...p,
    is_operational,
    // Curated data wins; Google fills the gaps. This is why ~96% of places
    // (DFP scrapes with no phone/site) stay blank until enriched.
    phone: p.phone ?? e.phone,
    website: p.website ?? e.website,
    // If Google gave us hours, we consider hours verified.
    hours_verified: e.has_hours ? true : p.hours_verified,
    is_verified: e.business_status === "OPERATIONAL" ? true : p.is_verified,
    google_photo_url: photos[0] ? photoProxy(photos[0], 800) : undefined,
    google_photos: photos.map((n) => photoProxy(n, 800)),
    google_rating: e.rating,
    google_rating_count: e.user_rating_count,
    google_hours: e.weekday_hours,
    google_verified: Boolean(e.business_status && e.business_status !== "UNKNOWN"),
  };
}

export type PlaceDetail = PlaceCardData & {
  category_name: string;
  municipality_name: string;
  nearby_places: PlaceCardData[];
  upcoming_events: Event[];
};

export function decoratePlace(p: Place, origin?: LngLat, now: Date = new Date()): PlaceCardData {
  const enriched = applyEnrichment(p);
  // Hours provenance, Phase 1 precedence: Google enrichment, then a
  // curated manual schedule. OSM hours apply to the map's OSM layer,
  // not the static place records, so they are not stamped here.
  const e = ENRICHMENT[p.slug];
  const hours_source: Place["hours_source"] = e?.has_hours
    ? "google_places"
    : enriched.hours && enriched.hours_verified
      ? "manual_override"
      : undefined;
  const hours_updated_at =
    hours_source === "google_places"
      ? e?.enriched_at
      : hours_source === "manual_override"
        ? p.updated_at
        : undefined;
  return {
    ...enriched,
    hours_source,
    hours_updated_at,
    open_status: getOpenStatus(enriched.hours, { verified: enriched.hours_verified ?? false }, now),
    distance_m: origin ? haversineMeters(origin, enriched.geom) : undefined,
  };
}

/** Share of places that carry verified hours, for the Open-now gate. */
export function hoursCoverage(places: PlaceCardData[]): number {
  if (!places.length) return 0;
  return places.filter((p) => p.hours_source).length / places.length;
}

const HOURS_GATE = process.env.HOURS_GATE === "1";

/**
 * True when the Open-now affordance should hide because verified-hours
 * coverage for the visible set is under 60 percent. Flag-gated, default
 * off, so flags-off equals today's production. Callers render the
 * STYLE.md message; no UI is changed in Phase 1.
 */
export function shouldHideOpenNow(places: PlaceCardData[]): boolean {
  return HOURS_GATE && hoursCoverage(places) < 0.6;
}

export function getPlaceBySlug(slug: string, origin?: LngLat, now: Date = new Date()): PlaceDetail | null {
  const p = BASE_BY_SLUG[slug];
  if (!p) return null;
  const decorated = decoratePlace(p, origin, now);

  const nearby_places = BASE_PLACES
    .filter((x) => x.slug !== p.slug)
    .map((x) => decoratePlace(x, p.geom, now))
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity))
    .slice(0, 6);

  return {
    ...decorated,
    category_name: CATEGORY_BY_SLUG[p.category]?.name ?? p.category,
    municipality_name: MUNICIPALITY_BY_SLUG[p.municipality]?.name ?? p.municipality,
    nearby_places,
    upcoming_events: eventsAtVenue(p.slug),
  };
}

export type RankingContext = {
  origin?: LngLat;
  now?: Date;
  preferOpen?: boolean;
  category?: string;
  municipality?: string;
  tags?: string[];
  limit?: number;
};

function proximityScore(distance_m: number | undefined): number {
  if (distance_m === undefined) return 0.5;
  if (distance_m < 500) return 1;
  if (distance_m < 1500) return 0.8;
  if (distance_m < 3000) return 0.6;
  if (distance_m < 8000) return 0.4;
  return 0.2;
}

function openScore(status: OpenStatus): number {
  if (status.state === "open") return 1;
  if (status.state === "closing-soon") return 0.6;
  if (status.state === "unknown") return 0.5;
  return 0;
}

/**
 * The single closed-place predicate. Any surface that renders places
 * must filter through this so closed businesses never display. The
 * Radius page regressed by consuming the raw PLACES array directly.
 */
export function isOperational(p: Place): boolean {
  if (isKnownClosed(p.name)) return false; // manual override of last resort
  return p.is_operational !== "closed_permanently" && p.is_operational !== "closed_temporarily";
}

export function rankPlaces(ctx: RankingContext = {}): PlaceCardData[] {
  const now = ctx.now ?? new Date();
  let results = BASE_PLACES
    .filter(isOperational)
    .map((p) => decoratePlace(p, ctx.origin, now));

  if (ctx.category) {
    results = results.filter(
      (p) => p.category === ctx.category || (p.subcategories ?? []).includes(ctx.category!)
    );
  }
  if (ctx.municipality) {
    results = results.filter((p) => p.municipality === ctx.municipality);
  }
  if (ctx.tags?.length) {
    results = results.filter((p) => ctx.tags!.every((t) => (p.tags ?? []).includes(t)));
  }
  if (ctx.preferOpen) {
    results = results.filter((p) => p.open_status.state !== "closed");
  }

  results.sort((a, b) => {
    const sa = a.feature_score * 0.4 + proximityScore(a.distance_m) * 0.3 + openScore(a.open_status) * 0.3;
    const sb = b.feature_score * 0.4 + proximityScore(b.distance_m) * 0.3 + openScore(b.open_status) * 0.3;
    return sb - sa;
  });

  return ctx.limit ? results.slice(0, ctx.limit) : results;
}

export function placesWithinRadius(origin: LngLat, meters: number, now: Date = new Date()): PlaceCardData[] {
  return BASE_PLACES
    .filter(isOperational)
    .map((p) => decoratePlace(p, origin, now))
    .filter((p) => (p.distance_m ?? Infinity) <= meters)
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
}
