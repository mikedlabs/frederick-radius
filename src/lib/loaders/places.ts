import { PLACES, PLACE_BY_SLUG, type Place } from "@/data/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { eventsAtVenue, type Event } from "@/data/events";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { categoryFromPrimaryType } from "@/lib/categoryFromGoogle";
import { isNonDiscoverable } from "@/lib/relevance";
import { getOpenStatus, type OpenStatus } from "@/lib/hours";
import { isKnownClosed } from "@/lib/integrations/closures";
import ENRICHMENT_RAW from "@/data/places-enrichment.json" with { type: "json" };
import DEDUP_RAW from "@/data/places-dedup.json" with { type: "json" };
import { RELIABLE_OPEN_WINDOWS, isLikelyOpenNow } from "@/data/reliable-open-windows";
import { getLandmarkPhoto } from "@/lib/integrations/wikimedia";

type DedupEntry = { canonical: string; merged?: { website?: string; phone?: string } };
const DEDUP = DEDUP_RAW as Record<string, DedupEntry>;
// Default ON by owner directive (2026-05-16: "ship everything"). The
// dedupe is verified and all named venues fold. Set RADIUS_DEDUPE=0 to
// disable without a code change (instant rollback).
const DEDUPE_ON = process.env.RADIUS_DEDUPE !== "0";

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

// Urbana was added as a community AFTER the place data was scraped, so
// places physically inside its bounds were tagged to a neighbor and
// /m/urbana, the by-town view, and Radius would be empty for it. Claim
// them by geography so Urbana gets "all the things the other towns
// have". Scoped to Urbana ONLY — deterministic, zero effect on any
// other municipality's set.
const URBANA_BBOX = MUNICIPALITY_BY_SLUG["urbana"]?.bbox;
function claimUrbana(p: Place): Place {
  if (!URBANA_BBOX || p.municipality === "urbana") return p;
  const [minLng, minLat, maxLng, maxLat] = URBANA_BBOX;
  const { lng, lat } = p.geom;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
    ? { ...p, municipality: "urbana" }
    : p;
}

const BASE_PLACES: Place[] = (DEDUPE_ON ? applyDedup(PLACES) : PLACES).map(
  claimUrbana,
);
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
  lat?: number;
  lng?: number;
  primary_type?: string;
  editorial_summary?: string;
  review_snippet?: string;
  review_author?: string;
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
  /** One attributed Google review snippet — "what people say". Shown
   *  as labelled UGC, never as our own description/SEO copy. */
  review_snippet?: string;
  review_author?: string;
};

const photoProxy = (name: string, w = 800) =>
  `/api/place-photo?name=${encodeURIComponent(name)}&w=${w}`;

export type PlaceCardData = Place & PlaceEnriched & {
  open_status: OpenStatus;
  distance_m?: number;
  /** "verified" = Google hours confirm open. "likely" = curated window. */
  open_confidence?: "verified" | "likely";
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
  // Pin accuracy: the DFP scrape geocoded ~157 places to the wrong
  // spot (owner verified several on the ground). Google's coordinate
  // for a matched place is authoritative, so snap to it — but ONLY
  // when it is a sane correction (≤2 km from the scrape). ~106
  // enrichments are bad Text-Search matches that resolved a same-name
  // business 3–50 km away; using those would teleport pins across the
  // county. Beyond 2 km we keep the scrape and treat the match as
  // suspect. Every surface (map, radius distance, nearby) inherits
  // this via the one canonical loader.
  const geom =
    typeof e.lat === "number" &&
    typeof e.lng === "number" &&
    haversineMeters(p.geom, { lng: e.lng, lat: e.lat }) <= 2000
      ? { lng: e.lng, lat: e.lat }
      : p.geom;
  // Category correction: Google's primaryType is authoritative — it
  // fixes the DFP miscategorization that no name heuristic can (a
  // coffee shop with no "coffee" in its name, a hotel filed under
  // shopping, etc.). Conservative: only confident Google types map;
  // a vague type returns null and the existing category is kept.
  const category = categoryFromPrimaryType(e.primary_type) ?? p.category;
  // Curated editorial voice (seed/manual) is kept; for DFP + Google-
  // discovered, Google's real one-line description replaces the
  // scraped/placeholder blurb ("Coffee in Thurmont"). Never blank,
  // never fabricated — only a real Google summary wins.
  const short_blurb =
    p.source !== "seed" && p.source !== "manual" && e.editorial_summary?.trim()
      ? e.editorial_summary.trim()
      : p.short_blurb;
  return {
    ...p,
    geom,
    category,
    short_blurb,
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
    review_snippet: e.review_snippet?.trim() || undefined,
    review_author: e.review_author?.trim() || undefined,
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

// Default ON by owner directive (2026-05-16: "ship everything"). At
// today's ~3.6% verified-hours coverage this hides the Open-now
// affordance widely in favor of an honest message, which is the
// trustworthy behavior the data-layer brief asked for. Set
// HOURS_GATE=0 to restore the always-show behavior (instant rollback).
const HOURS_GATE = process.env.HOURS_GATE !== "0";

/**
 * True when the Open-now affordance should hide because verified-hours
 * coverage for the visible set is under 60 percent. Callers render the
 * STYLE.md message in place of the affordance.
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
    .filter(isOperational)
    .filter(isDiscoverable)
    .filter(isSubstantive)
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

// Default ON by owner directive (2026-05-17: "hide the businesses most
// people wouldn't look for"). At today's enrichment this quiets ~304
// DFP-scraped B2B/trade/professional/residential records that made the
// product feel like a phone book. Set RADIUS_RELEVANCE=0 to show
// everything again without a code change (instant rollback).
const RELEVANCE_ON = process.env.RADIUS_RELEVANCE !== "0";

/**
 * Discovery-relevance predicate. False ONLY when both guards agree:
 * the record is DFP-scraped (curated seed/manual/GIS is always kept,
 * so a bad Google text-match can't erase it) AND Google's primaryType
 * is an explicit non-discoverable type (B2B / trade / professional-
 * services / residential — see relevance.ts). A vague or missing type
 * is always kept. Used by the list/map/Radius generators below; single-
 * slug retrieval deliberately does NOT use it, so a saved or linked
 * record still resolves — we hide from discovery, never destroy.
 */
export function isDiscoverable(p: Place): boolean {
  if (!RELEVANCE_ON) return true;
  if (p.source !== "dfp") return true; // never hide curated content
  return !isNonDiscoverable(ENRICHMENT[p.slug]?.primary_type);
}

// Default ON (owner: "prune the bare entries", 2026-05-18). Hides the
// ~2% bare-bones discovered tail. Set RADIUS_PRUNE_THIN=0 to disable
// without a code change (instant rollback).
const PRUNE_THIN_ON = process.env.RADIUS_PRUNE_THIN !== "0";

/**
 * Substance predicate. False ONLY for the bare-bones discovered tail:
 * a bulk-scraped/discovered record (dfp|google) with NO Google rating,
 * NO photo, and NO editorial summary — nothing but a name, category
 * and a point. Curated seed/manual is ALWAYS substantive (never hidden
 * by this). Like isDiscoverable: the discovery generators below use
 * it; single-slug retrieval deliberately does NOT, so a saved or
 * linked record still resolves — we hide from discovery, never
 * destroy. Cheap: reads the enrichment map, never decorates.
 */
export function isSubstantive(p: Place): boolean {
  if (!PRUNE_THIN_ON) return true;
  if (p.source !== "dfp" && p.source !== "google") return true;
  // Any real signal keeps it: a Google rating, a photo of ANY kind
  // (Google enrichment, seed hero, or a Wikimedia landmark match), or
  // a real editorial summary. Hidden only when it has NONE of these —
  // a name + category + point and nothing else.
  if (p.hero_image || getLandmarkPhoto(p.slug)) return true;
  const e = ENRICHMENT[p.slug];
  if (!e) return false;
  return Boolean(
    e.rating ||
      (e.photo_names && e.photo_names.length > 0) ||
      (e.editorial_summary && e.editorial_summary.trim().length > 0),
  );
}

/**
 * P0-1: the ONE canonical public place set. Every non-admin surface
 * (Radius/home, Map, Search, Municipality, Saved, Sitemap, Plan) must
 * start here so users see the same reality on every route: deduplicated
 * (gated by RADIUS_DEDUPE), closed businesses removed, and the non-
 * discoverable B2B long tail quieted (gated by RADIUS_RELEVANCE). Raw
 * PLACES stays available only for admin, audits, and scripts.
 */
export function publicPlaces(): Place[] {
  return BASE_PLACES.filter(isOperational).filter(isDiscoverable).filter(isSubstantive);
}

/** Public places in one municipality (canonical set, not raw). */
export function publicPlacesByMunicipality(slug: string): Place[] {
  return publicPlaces().filter((p) => p.municipality === slug);
}

/**
 * Resolve a slug to its canonical public place. Folded-duplicate and
 * old slugs resolve to the canonical record (BASE_BY_SLUG already does
 * this); closed or unknown slugs return undefined so saved/linked
 * closed records do not render.
 */
export function publicPlaceBySlug(slug: string): Place | undefined {
  const p = BASE_BY_SLUG[slug];
  return p && isOperational(p) ? p : undefined;
}

/** Back-compat alias. Prefer publicPlaces() in new code. */
export function radiusPlaces(): Place[] {
  return publicPlaces();
}

/**
 * Marquee places whose curated reliable window says they are open now,
 * tagged "likely". Used as the home "Open now" fallback when Google has
 * not verified anything, so the panel never shows a defeating empty
 * state. Closed places are still excluded.
 */
export function likelyOpenPlaces(origin?: LngLat, now: Date = new Date()): PlaceCardData[] {
  return BASE_PLACES
    .filter(isOperational)
    .filter(isDiscoverable)
    .filter(isSubstantive)
    .filter((p) => p.slug in RELIABLE_OPEN_WINDOWS && isLikelyOpenNow(p.slug, now))
    .map((p) => ({ ...decoratePlace(p, origin, now), open_confidence: "likely" as const }))
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
}

export function rankPlaces(ctx: RankingContext = {}): PlaceCardData[] {
  const now = ctx.now ?? new Date();
  let results = BASE_PLACES
    .filter(isOperational)
    .filter(isDiscoverable)
    .filter(isSubstantive)
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
    .filter(isDiscoverable)
    .filter(isSubstantive)
    .map((p) => decoratePlace(p, origin, now))
    .filter((p) => (p.distance_m ?? Infinity) <= meters)
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
}
