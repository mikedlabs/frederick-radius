import { PLACES, type Place } from "@/data/places";
import { CATEGORY_BY_SLUG, CATEGORIES } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { eventsAtVenue, type Event } from "@/data/events";
import { haversineMeters, isValidCoord, type LngLat } from "@/lib/geo";
import { categoryFromPrimaryType } from "@/lib/categoryFromGoogle";
import { isNonDiscoverable, isRecommendable, SUPPRESSED_JUNK_SLUGS } from "@/lib/relevance";
import { getOpenStatus, isOpenNow, type OpenStatus } from "@/lib/hours";
import { stampPlaceProvenance, type Provenance } from "@/lib/provenance";
import { mayAssertOpenState } from "@/lib/hours-freshness";
import { parseGoogleHours } from "@/lib/googleHours";
import { isKnownClosed } from "@/lib/integrations/closures";
import ENRICHMENT_RAW from "@/data/places-enrichment.json" with { type: "json" };
import DEDUP_RAW from "@/data/places-dedup.json" with { type: "json" };
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
import KNOWN_FOR_RAW from "@/data/known-for.json" with { type: "json" };
import PHOTO_SUPPRESS_RAW from "@/data/photo-suppress.json" with { type: "json" };
import LOCAL_FAVORITES_RAW from "@/data/local-favorites.json" with { type: "json" };
import SEASONAL_RAW from "@/data/seasonal-places.json" with { type: "json" };
import HOURS_REFRESH_RAW from "@/data/places-hours-refresh.json" with { type: "json" };
import { HIDDEN_GEM_SLUGS } from "@/data/hidden-gems";
import { RELIABLE_OPEN_WINDOWS, isLikelyOpenNow } from "@/data/reliable-open-windows";
import { getLandmarkPhoto } from "@/lib/integrations/wikimedia";
import { autoFold } from "@/lib/dedupe";
import { makeResolver, patchRecord, type Overrides } from "@/lib/overrides";
import { normalizePlaceName, normalizeCity } from "@/lib/format/placeName";
import { hasFieldNotes, fieldNotesFor } from "@/lib/loaders/fieldNotes";
import { dealHook, figureCount } from "@/lib/happyHourDeal";

type DedupEntry = { canonical: string; merged?: { website?: string; phone?: string } };
const DEDUP = DEDUP_RAW as Record<string, DedupEntry>;

// Parent category slug → its direct child slugs, computed once. Lets a
// category page for a parent (food, outdoors, arts…) aggregate its children
// in rankPlaces. Leaf categories simply aren't keys here.
const CATEGORY_CHILDREN = new Map<string, string[]>();
for (const c of CATEGORIES) {
  if (c.parent) {
    CATEGORY_CHILDREN.set(c.parent, [...(CATEGORY_CHILDREN.get(c.parent) ?? []), c.slug]);
  }
}

// Shared-photo suppression set (de-twin): slugs whose hero photo is nulled
// so two cards never show the same Google photo. Generated, reviewable —
// see scripts/build-photo-suppress.ts + src/data/photo-suppress.json.
const PHOTO_SUPPRESS = new Set((PHOTO_SUPPRESS_RAW as { slugs: string[] }).slugs);

// Seasonal-place gate. Keyed by slug; values are { months: number[],
// label: string }. The _doc key in the JSON is metadata; skip it.
// A place listed here is HIDDEN from public listings whenever the
// current month isn't in its months array. /places/<slug> still
// resolves so shared links / sitemap entries don't 404.
type SeasonalEntry = { label?: string; months: number[] };
const SEASONAL = Object.fromEntries(
  Object.entries(SEASONAL_RAW as Record<string, unknown>).filter(
    ([k]) => !k.startsWith("_"),
  ),
) as Record<string, SeasonalEntry>;

/**
 * Rolling hours refresh (data brief 4.3): the committed materialization
 * of the place_hours_refresh table (npm run refresh:hours). An entry
 * here overrides the static enrichment hours and business status for
 * its slug, and its refreshed_at is the verification date the
 * freshness policy reads. The _doc key is metadata.
 */
type HoursRefreshEntry = {
  weekday_hours?: string[];
  business_status?: string;
  refreshed_at: string;
};
const HOURS_REFRESH = Object.fromEntries(
  Object.entries(HOURS_REFRESH_RAW as Record<string, unknown>).filter(
    ([k]) => !k.startsWith("_"),
  ),
) as Record<string, HoursRefreshEntry>;

/**
 * Whether a place is currently in season. Non-seasonal places (the
 * vast majority) are always in season — only entries in seasonal-
 * places.json are gated. Pure: month is read from the injected
 * `now`, so unit tests can advance the clock without mocking Date.
 */
export function isInSeason(p: Pick<Place, "slug">, now: Date = new Date()): boolean {
  const s = SEASONAL[p.slug];
  if (!s) return true;
  const month = now.getMonth() + 1; // 1-indexed
  return s.months.includes(month);
}
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
// other municipality's set. Composed onto the END of the dedupe +
// overrides pipeline below, so it survives folds/patches.
const URBANA_BBOX = MUNICIPALITY_BY_SLUG["urbana"]?.bbox;
function claimUrbana(p: Place): Place {
  if (!URBANA_BBOX || p.municipality === "urbana") return p;
  const [minLng, minLat, maxLng, maxLat] = URBANA_BBOX;
  const { lng, lat } = p.geom;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
    ? { ...p, municipality: "urbana" }
    : p;
}

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

/**
 * AI-extracted "known for" + "customers loved" tags keyed by slug.
 * Generated by scripts/extract-known-for.mjs (gpt-4o-mini via the
 * Vercel AI Gateway). The script is idempotent — re-running only
 * processes slugs not already in the file. Entries with no signal
 * worth surfacing are simply absent.
 */
type KnownFor = {
  known_for?: string[];
  customers_loved?: string[];
  source?: string;
  extracted_at?: string;
};
const KNOWN_FOR = KNOWN_FOR_RAW as Record<string, KnownFor>;

/**
 * Local-favorite signal — the "a friend would send you here" axis the
 * visitor curated-picks ranking blends in (see rankPlaces profile:
 * "visitor"). Two layers:
 *
 *   1. Hand-picks (local-favorites.json → `picks`). Editorial truth
 *      that no metric can see: the gem locals love that has few Google
 *      reviews, the institution everyone names. Always wins.
 *   2. Data proxy (isLocalFavoriteByData). Until the hand-pick list is
 *      curated, a high Google rating + enough reviews + verified-open
 *      stands in for "locals vouch for this." `exclude` force-removes a
 *      place from the proxy (the well-reviewed tourist trap a local
 *      wouldn't actually recommend).
 *
 * This is the approach we committed to: ship on the data proxy now,
 * let the hand-pick list override and accrete over time.
 */
const LOCAL_FAVORITE_PICKS = new Set<string>(
  (LOCAL_FAVORITES_RAW.picks as string[] | undefined) ?? [],
);
const LOCAL_FAVORITE_EXCLUDE = new Set<string>(
  (LOCAL_FAVORITES_RAW.exclude as string[] | undefined) ?? [],
);

/** Minimum Google reviews before a high rating counts as a vouch.
 *  A 5.0 with three reviews is noise; ~40 is a real local signal. */
const LOCAL_FAVORITE_MIN_REVIEWS = 40;
/** Rating floor for the data proxy. Tuned to "a local would send you." */
const LOCAL_FAVORITE_MIN_RATING = 4.5;

function isLocalFavoriteByData(
  rating: number | undefined,
  count: number | undefined,
  verified: boolean | undefined,
): boolean {
  return (
    Boolean(verified) &&
    (rating ?? 0) >= LOCAL_FAVORITE_MIN_RATING &&
    (count ?? 0) >= LOCAL_FAVORITE_MIN_REVIEWS
  );
}

/** Resolve the final local-favorite flag: hand-pick wins, then proxy,
 *  with the exclude list vetoing the proxy (never the hand-pick). */
export function resolveLocalFavorite(
  slug: string,
  rating: number | undefined,
  count: number | undefined,
  verified: boolean | undefined,
): boolean {
  if (LOCAL_FAVORITE_PICKS.has(slug)) return true;
  if (LOCAL_FAVORITE_EXCLUDE.has(slug)) return false;
  return isLocalFavoriteByData(rating, count, verified);
}

/**
 * The HUMAN data-cleaning layer (places-overrides.json, written by
 * `npm run data:review`). This is how the irreducible judgement tail
 * the safe engine cannot touch — typo dupes ("Summitra" vs "Sumittra
 * Thai Cuisine"), junk records, wrong categories — gets fixed in one
 * place and lands on every surface. Applied HERE so it can never be
 * forgotten by a caller.
 */
const OVERRIDES = OVERRIDES_RAW as Overrides;
const OV_FOLD: Record<string, string> = OVERRIDES.fold ?? {};
const OV_REMOVE: ReadonlySet<string> = new Set(OVERRIDES.remove ?? []);
const OV_KEEP: ReadonlySet<string> = new Set(OVERRIDES.keepApart ?? []);
const OV_PATCH = OVERRIDES.patch;

/**
 * Slugs the automatic engine must never fold away: the curator's
 * `canonical === self` markers in places-dedup.json PLUS every
 * `keepApart` slug in the overrides file. The one-line manual veto.
 */
const PINNED: ReadonlySet<string> = new Set([
  ...Object.entries(DEDUP)
    .filter(([slug, e]) => e.canonical === slug)
    .map(([slug]) => slug),
  ...OV_KEEP,
]);

/**
 * Three-stage cleaning applied HERE, at the one canonical source, so
 * every non-admin surface (Radius/home, Map, Search, Municipality,
 * Saved, Sitemap, Plan) inherits a single reality and the "I keep
 * seeing the same thing twice" problem cannot regress:
 *   1. places-dedup.json — curated legacy human folds.
 *   2. autoFold — the deterministic same-place rule (src/lib/dedupe.ts)
 *      over the survivors, so a NEW exact/variant dupe is collapsed
 *      the moment it enters the data, zero upkeep, safelist-guarded.
 *   3. places-overrides.json — the human judgement tail the safe rule
 *      cannot touch: typo folds, junk removals, field patches. Written
 *      by `npm run data:review`; applied last so a human always wins.
 * Gated by RADIUS_DEDUPE for instant rollback (overrides remove/patch
 * are data corrections and stay honored even then).
 */
const STATIC_DEDUPED: Place[] = DEDUPE_ON ? applyDedup(PLACES) : PLACES;

const AUTO_FOLD: Map<string, string> = DEDUPE_ON
  ? autoFold(
      STATIC_DEDUPED.map((p) => ({
        slug: p.slug,
        name: p.name,
        geom: p.geom,
        source: p.source,
        municipality: p.municipality,
        google_place_id: p.google_place_id,
        feature_score: p.feature_score,
        hasEnrichment: Boolean(ENRICHMENT[p.slug]),
      })),
      PINNED,
    )
  : new Map<string, string>();

// Every slug → its final surviving canonical, chasing human folds
// first, then auto folds, then legacy folds (chain- and cycle-safe).
const DEDUP_AS_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(DEDUP).map(([s, e]) => [s, e.canonical]),
);
const resolveCanonicalSlug = makeResolver([OV_FOLD, AUTO_FOLD, DEDUP_AS_MAP]);

const BASE_PLACES: Place[] = (DEDUPE_ON ? STATIC_DEDUPED : PLACES)
  // Drop anything folded away (auto OR human typo fold) and any
  // human-removed junk; then apply human field patches. remove/patch
  // are data corrections so they apply even with dedupe disabled.
  .filter(
    (p) =>
      !OV_REMOVE.has(p.slug) &&
      (!DEDUPE_ON || (!AUTO_FOLD.has(p.slug) && !OV_FOLD[p.slug])),
  )
  // Display-name cleanup (Google artifacts: "Pnc Bank 8", "Mcclintock").
  // BEFORE patchRecord so a curated name override in places-overrides.json
  // always wins over the automatic transform.
  .map((p) => (p.name ? { ...p, name: normalizePlaceName(p.name) } : p))
  // City-field hygiene: fold the editorial "Downtown Frederick" pseudo-city,
  // repair case/spelling variants, and replace non-city junk ("MD", a county,
  // a street address) with the municipality-derived postal city. BEFORE
  // patchRecord so a curated city override would win. Lesson of the city-split
  // + variant audit (2026-06).
  .map((p) => (p.city ? { ...p, city: normalizeCity(p.city, p.municipality) } : p))
  // postal_code backfill: 952/1646 records had an empty (or "MD"/"United
  // States") ZIP slot despite a valid MD ZIP sitting in the address string
  // (2026-06-20 data audit). Parse the /2[01]\d{3}/ token out of the address
  // when the field isn't already a 5-digit ZIP. Boundary cleaning, BEFORE
  // patchRecord so a curated override still wins.
  .map((p) => {
    const cur = String(p.postal_code ?? "");
    if (/^\d{5}/.test(cur)) return p;
    const zip = String(p.address ?? "").match(/\b(2[01]\d{3})\b/)?.[1];
    if (zip) return { ...p, postal_code: zip };
    // No recoverable ZIP: clear a junk non-ZIP value ("MD"/"United States") so
    // it can't masquerade as a postal code; leave a genuinely-empty field empty.
    return cur ? { ...p, postal_code: "" } : p;
  })
  .map((p) => patchRecord(p, OV_PATCH))
  // Urbana geo-claim runs LAST so it composes with dedupe + overrides.
  .map(claimUrbana)
  // County gate (2026-06 redesign audit, ranking-trust blocker). The
  // dataset carried 79 out-of-county records wearing member-town labels
  // (a Smithsburg bar tagged thurmont led the guide's "Best match" with
  // a "498 min walk" caption; Boonsboro coffee shops tagged myersville).
  // isValidCoord now tests the real county outline plus a 1.5km straddle
  // buffer, so Mount Airy's cross-line Main Street survives and true
  // foreigners leave every surface. EXCLUDED, not down-ranked: these are
  // not Frederick County places, and one confident wrong answer costs
  // more trust than 79 missing rows.
  .filter((p) => isValidCoord(p.geom));

// Build-time visibility into excluded places. Server-only so it
// doesn't run in the browser. Same shape as the events placement
// warning so build logs read consistently.
if (typeof window === "undefined") {
  const preGate = (DEDUPE_ON ? STATIC_DEDUPED : PLACES).filter(
    (p) =>
      !OV_REMOVE.has(p.slug) &&
      (!DEDUPE_ON || (!AUTO_FOLD.has(p.slug) && !OV_FOLD[p.slug])),
  );
  const excluded = preGate.filter((p) => !isValidCoord(claimUrbana(p).geom));
  if (excluded.length > 0) {
    const sample = excluded.slice(0, 5).map((p) => p.slug).join(", ");
    console.warn(
      `[placement] places: ${excluded.length} row(s) excluded (outside county outline + 1.5km buffer, or missing coord). Examples: ${sample}`,
    );
  }
}

const BASE_BY_SLUG: Record<string, Place> = (() => {
  const byCanon: Record<string, Place> = {};
  for (const p of BASE_PLACES) byCanon[p.slug] = p;
  const idx: Record<string, Place> = { ...byCanon };
  // Every original slug (folded, legacy, typo, old link) resolves to
  // its surviving canonical record. Removed slugs deliberately do not
  // resolve, so getPlaceBySlug returns null and they vanish entirely.
  for (const p of PLACES) {
    if (OV_REMOVE.has(p.slug) || idx[p.slug]) continue;
    const canon = byCanon[resolveCanonicalSlug(p.slug)];
    if (canon) idx[p.slug] = canon;
  }
  return idx;
})();

/** Google-verified data merged onto a place, when available. */
export type PlaceEnriched = Omit<Provenance, "source"> & {
  /** Proxied photo URL (server route, key-safe) — first photo, for heroes */
  google_photo_url?: string;
  /** All proxied photo URLs (key-safe), for galleries */
  google_photos?: string[];
  google_rating?: number;
  google_rating_count?: number;
  /** Google Places primaryType — drives recommendation eligibility
   *  (isRecommendable) so institutions don't lead "things to do". */
  primary_type?: string;
  /** "A friend would send you here." Hand-picked in local-favorites.json
   *  or derived from a strong, well-reviewed, verified Google profile.
   *  Blended into the visitor curated-picks ranking and surfaced as a
   *  "Local favorite" trust chip. */
  local_favorite?: boolean;
  /** Human-readable weekly hours from Google */
  google_hours?: string[];
  /** True once Google has verified this place */
  google_verified?: boolean;
  /** One attributed Google review snippet — "what people say". Shown
   *  as labelled UGC, never as our own description/SEO copy. */
  review_snippet?: string;
  review_author?: string;
  /** Structured signal extracted (by AI) from editorial_summary +
   *  review_snippet — see scripts/extract-known-for.mjs. Surfaced as
   *  a chip strip on /places/[slug] so visitors get the WHAT (food,
   *  experience) without reading a paragraph. Either array may be
   *  empty when the source text was too generic to extract from. */
  known_for?: string[];
  customers_loved?: string[];
  /**
   * ISO date marking when this row was last verified against an
   * authoritative source. Enriched rows: the date of the Google sync
   * batch (constant below, bumped per enrichment run). Curated-only
   * rows: the editor's date. Used by the FreshnessChip on detail.
   */
  last_verified_at?: string;
};

/**
 * Date of the most recent Google enrichment sync. Bump this constant
 * (or wire it to the build pipeline) every time `places-enrichment.json`
 * is regenerated so the UI's freshness chip reflects reality. Curated-
 * only places without enrichment fall back to SEED_VERIFIED_AT below.
 */
const ENRICHMENT_VERIFIED_AT = "2026-05-14T00:00:00Z";
const SEED_PLACE_VERIFIED_AT = "2026-05-14T00:00:00Z";

// Slug is optional but recommended: when included, the photo route uses
// it to render a richer fallback placeholder (place initials + category
// color) on the days Google rotates the underlying photo reference and
// the upstream fetch fails. Without the slug, the placeholder degrades
// to a generic gradient.
const photoProxy = (name: string, w = 800, slug?: string) =>
  `/api/place-photo?name=${encodeURIComponent(name)}&w=${w}${slug ? `&slug=${encodeURIComponent(slug)}` : ""}`;

// Blob-backed photos win over the rotating Google proxy. The download
// script (npm run download:photos) writes src/data/places-photos.json
// mapping slug → public Blob URL. Imported here so the loader resolves
// the right source ONCE per place at build time. Slugs not in the map
// fall through to the proxy.
import { placePhotoBlob } from "@/lib/places-photos";

export type PlaceCardData = Place & PlaceEnriched & {
  open_status: OpenStatus;
  distance_m?: number;
  /** "verified" = Google hours confirm open. "likely" = curated window. */
  open_confidence?: "verified" | "likely";
  /** Has a VERIFIED Field Notes entry (happy hour / deal / parking / insider
   *  tip) confirmed at the source. The moat. Precomputed in decoratePlace so
   *  cards, popups, and the map filter read one flag without bundling
   *  field-notes.json into the client. */
  field_notes?: boolean;
  /** The deal HOOK to show on the card ("25% OFF", "$1", "Happy hour") when
   *  this venue has a verified STANDING happy-hour figure. Derived from the
   *  happy-hour details only (never a day-specific deal), so a static card can
   *  never claim "today's" special on the wrong day. Precomputed server-side so
   *  field-notes.json stays off the client. */
  deal_hook?: string;
};

/**
 * Provenance stamp adapted to the Place type: the stamper normalizes a
 * missing source to "discovered", and the cast is sound because the
 * Place source union includes every value the stamper can produce.
 */
function stampForPlace(p: Place, verifiedAt: string): Omit<Provenance, "source"> & { source: Place["source"] } {
  const { source, ...rest } = stampPlaceProvenance(p, verifiedAt);
  return { ...rest, source: source as Place["source"] };
}

function applyEnrichment(p: Place): Place & PlaceEnriched {
  const e = ENRICHMENT[p.slug];
  if (!e)
    return {
      ...p,
      // Provenance (data brief 4.1): stamped at this chokepoint so every
      // row that reaches a surface carries all seven fields. The un
      // enriched branch verifies against the editorial pass date.
      ...stampForPlace(p, SEED_PLACE_VERIFIED_AT),
      // No Google profile to derive from, but an editorial hand-pick
      // still counts (and that is the whole reason hand-picks exist).
      local_favorite: resolveLocalFavorite(p.slug, undefined, undefined, p.is_verified),
    };
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
  // Category correction precedence:
  //   1. An explicit human category patch (places-overrides.json) is the
  //      FINAL word — per the overrides contract, patches win over every
  //      automated normalizer, including Google's primaryType. This is what
  //      lets a curator fix a contractor that Google labels
  //      "home_improvement_store" (a funeral home, an HVAC installer, a
  //      coworking space) that no type heuristic would get right.
  //   2. Otherwise Google's primaryType fixes the DFP miscategorization that
  //      no name heuristic can (a coffee shop with no "coffee" in its name).
  //      Conservative: only confident Google types map; a vague type returns
  //      null and the existing category is kept.
  const category =
    OV_PATCH?.[p.slug]?.category ?? categoryFromPrimaryType(e.primary_type) ?? p.category;
  // Curated editorial voice (seed/manual) is kept; for DFP + Google-
  // discovered, Google's real one-line description replaces the
  // scraped/placeholder blurb ("Coffee in Thurmont"). Never blank,
  // never fabricated — only a real Google summary wins.
  const short_blurb =
    p.source !== "seed" && p.source !== "manual" && e.editorial_summary?.trim()
      ? e.editorial_summary.trim()
      : p.short_blurb;
  // Hours: a hand-curated structured schedule (seed/manual, e.g. the
  // parks) always wins; otherwise parse Google's weekday strings into the
  // structured shape getOpenStatus needs. THIS is the line that lifts
  // open-now coverage from ~3.6% (curated only) to ~80% — the verified
  // hours were always in the enrichment; nothing turned the
  // "Monday: 9:00 AM - 5:00 PM" strings into { mon: [{ open, close }] }.
  const hours = p.hours ?? parseGoogleHours(e.weekday_hours);
  return {
    ...p,
    geom,
    category,
    short_blurb,
    hours,
    is_operational,
    // Editorial: wire the curated hidden-gem set onto the record so the
    // field documented on the Place type is actually populated (and the
    // "Hidden gem" reason chip + any future surface read one source).
    hidden_gem: HIDDEN_GEM_SLUGS.has(p.slug),
    // Curated data wins; Google fills the gaps. This is why ~96% of places
    // (DFP scrapes with no phone/site) stay blank until enriched.
    phone: p.phone ?? e.phone,
    website: p.website ?? e.website,
    // If Google gave us hours, we consider hours verified.
    hours_verified: e.has_hours ? true : p.hours_verified,
    is_verified: e.business_status === "OPERATIONAL" ? true : p.is_verified,
    // Photo source resolution:
    //   1. Blob URL from the downloader (permanent, never rotates)
    //   2. Live proxy through the API key (rotates every few weeks)
    //   3. undefined (component falls back to category placeholder)
    // The Blob URL is the long-term answer; the proxy is the bridge
    // until the downloader has been run for that slug.
    google_photo_url:
      placePhotoBlob(p.slug) ??
      (photos[0] ? photoProxy(photos[0], 800, p.slug) : undefined),
    // The detail page's photo gallery still uses the proxy for the
    // 2nd-8th photos — the downloader only stores the hero for now.
    // A future pass can extend it to the whole array.
    google_photos: photos.map((n) => photoProxy(n, 800, p.slug)),
    google_rating: e.rating,
    google_rating_count: e.user_rating_count,
    primary_type: e.primary_type,
    local_favorite: resolveLocalFavorite(
      p.slug,
      e.rating,
      e.user_rating_count,
      e.business_status === "OPERATIONAL" ? true : p.is_verified,
    ),
    google_hours: e.weekday_hours,
    google_verified: Boolean(e.business_status && e.business_status !== "UNKNOWN"),
    review_snippet: e.review_snippet?.trim() || undefined,
    review_author: e.review_author?.trim() || undefined,
    known_for: KNOWN_FOR[p.slug]?.known_for?.length
      ? KNOWN_FOR[p.slug]?.known_for
      : undefined,
    customers_loved: KNOWN_FOR[p.slug]?.customers_loved?.length
      ? KNOWN_FOR[p.slug]?.customers_loved
      : undefined,
    // Provenance (data brief 4.1): the enriched branch verifies against
    // the Google sync date. Spread last so the seven fields are the
    // single source of truth for trust metadata on the row. One upgrade
    // rule: a scraped row whose listing Google enrichment confirms (a
    // known business_status) earns "verified". Curated and partner rows
    // keep their tier; Google confirming existence does not change who
    // vouches for the content.
    ...(() => {
      const prov = stampForPlace(p, ENRICHMENT_VERIFIED_AT);
      const googleConfirmed = Boolean(e.business_status && e.business_status !== "UNKNOWN");
      return prov.confidence === "scraped" && googleConfirmed
        ? { ...prov, confidence: "verified" as const }
        : prov;
    })(),
  };
}

export type PlaceDetail = PlaceCardData & {
  category_name: string;
  municipality_name: string;
  nearby_places: PlaceCardData[];
  upcoming_events: Event[];
};

// Derived tags (audit theme #2: the audience/feature tags were shadow data AND
// barely populated). These are FACTUAL from the final category — outdoor for
// parks/trails/golf, indoor for the rainy-day-relevant indoor venues, and
// kid-friendly for playgrounds — so the "Good to know" row, faceting, and
// search have real data without fabricating per-place editorial claims. Unioned
// with any hand-curated tags; never replaces them.
const OUTDOOR_CATS = new Set(["park", "trail", "playground", "golf"]);
const INDOOR_CATS = new Set(["museum", "library", "gallery"]);
function deriveTags(category: string, tags?: string[]): string[] {
  const out = new Set(tags ?? []);
  if (OUTDOOR_CATS.has(category)) out.add("outdoor");
  if (INDOOR_CATS.has(category)) out.add("indoor");
  if (category === "playground") {
    out.add("kids-0-5");
    out.add("kids-6-12");
  }
  return [...out];
}

export function decoratePlace(p: Place, origin?: LngLat, now: Date = new Date()): PlaceCardData {
  const enriched = applyEnrichment(p);
  // Shared-photo de-twin: a suppressed record shares its Google photo with
  // a stronger canonical record in the same ChIJ cluster, so null its hero
  // (and gallery) — the card falls back to the category placeholder. "No
  // photo > wrong photo." See scripts/build-photo-suppress.ts.
  if (PHOTO_SUPPRESS.has(p.slug)) {
    enriched.google_photo_url = undefined;
    enriched.google_photos = [];
  }
  // Misattributed Google data: this slug was enriched with a co-located / same-
  // address OTHER business's Google listing, so its rating belongs to a
  // different business (verified per-place, 2026-06-20 phantom-ratings sweep).
  // Null the borrowed rating/count, and the hero photo when it shows the other
  // business ("no photo > wrong photo"), so reviews stay with who earned them.
  const ovClear = OV_PATCH?.[p.slug];
  if (ovClear?.clearGoogle) {
    enriched.google_rating = undefined;
    enriched.google_rating_count = undefined;
    enriched.local_favorite = false;
  }
  if (ovClear?.clearPhoto) {
    enriched.google_photo_url = undefined;
    enriched.google_photos = [];
  }
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
  // Rolling refresh override (4.3): a refreshed row carries newer Google
  // hours and status than the static enrichment, so it wins both the
  // schedule and the verification date — EXCEPT when a human hours patch
  // exists. A curated hours correction (places-overrides.json, the
  // "PM-entered-as-AM" typo fix) must win over the Google refresh, otherwise
  // the next refresh that adds this slug re-introduces the very typo the patch
  // fixed. enriched.hours already carries the patched schedule (applyEnrichment
  // takes p.hours first), so we just suppress the refresh override here.
  const refresh = HOURS_REFRESH[p.slug];
  const hasHoursPatch = Boolean(OV_PATCH?.[p.slug]?.hours);
  const refreshedHours = !hasHoursPatch && refresh?.weekday_hours
    ? parseGoogleHours(refresh.weekday_hours)
    : undefined;
  const hours = refreshedHours ?? enriched.hours;
  const hoursVerified = refreshedHours ? true : (enriched.hours_verified ?? false);
  const hoursVerifiedAt = refreshedHours ? refresh?.refreshed_at : hours_updated_at;
  if (refresh?.business_status === "CLOSED_PERMANENTLY") {
    enriched.is_operational = "closed_permanently";
  }
  return {
    ...enriched,
    tags: deriveTags(enriched.category, enriched.tags),
    hours,
    hours_verified: hoursVerified,
    hours_source: refreshedHours ? ("google_places" as const) : hours_source,
    hours_updated_at: hoursVerifiedAt,
    // The one decision point of the hours policy: open and closed
    // states render only from verified hours, and once enforcement is
    // on, only from hours verified inside the freshness window.
    open_status: getOpenStatus(hours, { verified: mayAssertOpenState(hoursVerified, hoursVerifiedAt, now) }, now),
    distance_m: origin ? haversineMeters(origin, enriched.geom) : undefined,
    field_notes: hasFieldNotes(p.slug),
    // Standing happy-hour figure only (e.g. "25% OFF") — never a day-specific
    // deal, so a static card can't lie about "today." Only when the deal names a
    // SINGLE figure: a lone "$1 OFF" pulled from a multi-part deal would strand
    // its subject and mislead. Undefined otherwise; the card keeps the generic tag.
    deal_hook: figureCount(fieldNotesFor(p.slug)?.happy_hour?.details) === 1
      ? (dealHook(fieldNotesFor(p.slug)?.happy_hour?.details) ?? undefined)
      : undefined,
  };
}

/**
 * slimForList — drop the detail-only heavy arrays (google_photos[],
 * google_hours[]) that NO list/grid card renders, before a server page hands
 * decorated places to a client component. Shrinks the per-page RSC payload +
 * client hydration cost (e.g. ~1.4MB off /category/food). The place-detail
 * surface uses the full loader, so this never starves it. Keeps the single
 * hero (google_photo_url), review_snippet/author, known_for, customers_loved.
 */
export function slimForList(p: PlaceCardData): PlaceCardData {
  const { google_photos: _gp, google_hours: _gh, ...rest } = p as PlaceCardData & {
    google_photos?: unknown;
    google_hours?: unknown;
  };
  void _gp;
  void _gh;
  return rest as PlaceCardData;
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
  /**
   * Ranking profile. Default (undefined) keeps the legacy
   * curation-led sort that every existing surface depends on. "visitor"
   * switches to the blended four-signal recipe (ratings + local-favorite
   * + closest/open + moment-fit) tuned for a stranger asking "where
   * should I go right now?" — see visitorScore and getCuratedPicks.
   */
  profile?: "visitor";
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
 * Rating axis (0–1) for the visitor blend. Bayesian shrinkage toward a
 * neutral prior so a 5.0 with three reviews does not outrank a 4.6 with
 * eight hundred — the exact failure mode that makes a "best nearby"
 * list feel untrustworthy to a stranger. A place with no rating returns
 * the neutral midpoint rather than 0, so the unrated aren't buried on a
 * signal they simply lack (their curation/proximity still carry them).
 */
const RATING_PRIOR_MEAN = 4.0; // county-wide center of mass for Google stars
const RATING_PRIOR_WEIGHT = 30; // reviews of "pull" toward the prior
export function ratingScore(rating: number | undefined, count: number | undefined): number {
  if (rating === undefined) return 0.5;
  const n = count ?? 0;
  const bayes = (n * rating + RATING_PRIOR_WEIGHT * RATING_PRIOR_MEAN) / (n + RATING_PRIOR_WEIGHT);
  // Map the meaningful band [3.0 … 5.0] onto [0 … 1]; clamp the tails.
  return Math.max(0, Math.min(1, (bayes - 3.0) / 2.0));
}

/**
 * Curation axis (0–1): the editorial/quality judgement. feature_score is
 * 0–10 (normalized here — the legacy default sort multiplied it raw,
 * which silently made it ~85% of that blend), lifted by the
 * local-favorite signal so "a friend would send you here" measurably
 * moves a place up.
 */
export function curationScore(featureScore: number, localFavorite: boolean | undefined): number {
  const base = Math.max(0, Math.min(1, featureScore / 10));
  const boost = localFavorite ? 0.15 : 0;
  return Math.min(1, base + boost);
}

/** Coarse Eastern daypart for moment-fit. Local copy so the loader has
 *  no dependency cycle with now-picks.ts (which imports rankPlaces). */
function dayPartLocal(d: Date): "morning" | "midday" | "evening" {
  const hour =
    parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hour12: false,
      }).format(d),
      10,
    ) % 24;
  if (hour < 10) return "morning";
  if (hour < 16) return "midday";
  return "evening";
}

const MOMENT_FIT: Record<"morning" | "midday" | "evening", ReadonlySet<string>> = {
  morning: new Set(["coffee", "bakery", "breakfast", "cafe", "park", "trail", "outdoors", "market"]),
  midday: new Set([
    "restaurant", "cafe", "coffee", "museum", "gallery", "park", "trail",
    "outdoors", "market", "shopping", "playground", "family",
  ]),
  evening: new Set([
    "restaurant", "bar", "brewery", "winery", "pizza", "music", "theater", "gallery",
  ]),
};

/**
 * Moment-fit axis (0–1): does this place suit the time the visitor is
 * actually standing there? A coffee shop scores high at 8am and low at
 * 9pm; a brewery the reverse. Categories with no strong daypart read sit
 * at a neutral 0.6 so they're neither boosted nor punished.
 */
export function momentFitScore(category: string, now: Date): number {
  return MOMENT_FIT[dayPartLocal(now)].has(category) ? 1 : 0.6;
}

/**
 * The visitor blend (0–1). All four signals the product brief calls out,
 * weighted to sum to 1: ratings & reviews, local-favorite curation,
 * closest-&-open, and right-for-the-moment. This is the "what a friend
 * would tell you" recipe — opt in via rankPlaces({ profile: "visitor" }).
 */
function visitorScore(p: PlaceCardData, now: Date): number {
  const proximityOpen = proximityScore(p.distance_m) * 0.6 + openScore(p.open_status) * 0.4;
  return (
    ratingScore(p.google_rating, p.google_rating_count) * 0.28 +
    curationScore(p.feature_score, p.local_favorite) * 0.28 +
    proximityOpen * 0.24 +
    momentFitScore(p.category, now) * 0.2
  );
}

/**
 * The single closed-place predicate. Any surface that renders places
 * must filter through this so closed businesses never display. The
 * Radius page regressed by consuming the raw PLACES array directly.
 */
export function isOperational(p: Place): boolean {
  if (isKnownClosed(p.name)) return false; // manual override of last resort
  // Google enrichment is the SOURCE OF TRUTH for closure. DFP-scraped
  // records hardcode is_operational: "operational" at load time so the
  // raw Place field can lie (Serendipity Market, Brass Copper Shop,
  // …). Read the live enrichment business_status first; only fall
  // back to the Place field when there is no enrichment.
  const e = ENRICHMENT[p.slug];
  if (e?.business_status === "CLOSED_PERMANENTLY") return false;
  if (e?.business_status === "CLOSED_TEMPORARILY") return false;
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
 * (gated by RADIUS_DEDUPE), closed businesses removed, the non-
 * discoverable B2B long tail quieted (gated by RADIUS_RELEVANCE), AND
 * coordinates validated against the county bbox so a mispositioned
 * marker can never reach a user. Off-bbox rows surface on
 * /admin/data-health via getNeedsReviewPlaces() so they are visible
 * to an editor before they are invisible to the world.
 */
export function publicPlaces(): Place[] {
  return BASE_PLACES
    .filter((p) => !SUPPRESSED_JUNK_SLUGS.has(p.slug))
    .filter(isOperational)
    .filter(isDiscoverable)
    .filter(isSubstantive)
    .filter((p) => isValidCoord(p.geom))
    .filter((p) => isInSeason(p));
}

/**
 * Places whose coordinate is missing or outside the Frederick County
 * bbox. These are dropped from every public surface and listed in
 * /admin/data-health so an editor can fix them.
 */
export function getNeedsReviewPlaces(): Place[] {
  return BASE_PLACES.filter((p) => !isValidCoord(p.geom));
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

/**
 * THE county-wide open-now count. Every surface that headlines a
 * county-wide "N open now" number reads this one function, so two
 * screens can never disagree (2026-06 redesign audit, offender 2:
 * /today said 54 while /open-now said 15 within minutes, because the
 * briefing counted raw PLACES with every curated hour trusted as
 * verified, while /open-now counted the decorated pipeline with the
 * freshness-window policy). Population and predicate are exactly the
 * /open-now headline's: the discovery pipeline, recommendable places,
 * the shared isOpenNow predicate over decorated open_status.
 */
export function countOpenNow(now: Date = new Date()): number {
  return BASE_PLACES
    .filter(isOperational)
    .filter(isDiscoverable)
    .filter(isSubstantive)
    .filter(isRecommendable)
    .filter((p) => isOpenNow(decoratePlace(p, undefined, now).open_status))
    .length;
}

export function rankPlaces(ctx: RankingContext = {}): PlaceCardData[] {
  const now = ctx.now ?? new Date();
  let results = BASE_PLACES
    .filter(isOperational)
    .filter(isDiscoverable)
    .filter(isSubstantive)
    .map((p) => decoratePlace(p, ctx.origin, now));

  if (ctx.category) {
    // A category page for a PARENT (food, outdoors, arts, shopping…) must
    // aggregate its children: /category/food is the whole Food & Drink scene
    // (restaurants, cafes, bars, breweries, bakeries…), not only the ~13
    // places literally tagged "food" (which were wineries — so the food hero
    // led with rural meaderies while 340+ restaurants never surfaced). Leaf
    // categories (coffee, restaurant) have no children, so this is a no-op
    // for them. See CATEGORY_CHILDREN.
    const children = CATEGORY_CHILDREN.get(ctx.category) ?? [];
    const match = new Set<string>([ctx.category, ...children]);
    results = results.filter(
      (p) => match.has(p.category) || (p.subcategories ?? []).some((s) => match.has(s)),
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

  if (ctx.profile === "visitor") {
    results.sort((a, b) => visitorScore(b, now) - visitorScore(a, now));
  } else {
    results.sort((a, b) => {
      const sa = a.feature_score * 0.4 + proximityScore(a.distance_m) * 0.3 + openScore(a.open_status) * 0.3;
      const sb = b.feature_score * 0.4 + proximityScore(b.distance_m) * 0.3 + openScore(b.open_status) * 0.3;
      return sb - sa;
    });
  }

  return ctx.limit ? results.slice(0, ctx.limit) : results;
}

/**
 * The curated short-list behind "Find somewhere good" — the answer to a
 * visitor standing somewhere, hungry, asking where a local would send
 * them. Not the full firehose: open-or-closing-soon, blended by the
 * four-signal visitor recipe, capped short. Pass a `category` (e.g.
 * "restaurant", "coffee", "bar") to scope it to the moment's craving.
 *
 * This is deliberately a thin wrapper over rankPlaces({ profile:
 * "visitor" }) so every caller shares one ranking definition.
 */
export function getCuratedPicks(
  ctx: Omit<RankingContext, "profile" | "preferOpen"> & { limit?: number } = {},
): PlaceCardData[] {
  const { limit = 12, ...rest } = ctx;
  // Recommendation surface → editorial eligibility applies: a school /
  // daycare / admissions office is findable elsewhere but never a curated
  // "go here now" pick. Filter BEFORE the limit so we don't waste slots.
  return rankPlaces({
    ...rest,
    profile: "visitor",
    preferOpen: true, // a stranger deciding now can't use a closed door
  })
    .filter(isRecommendable)
    .slice(0, limit);
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
