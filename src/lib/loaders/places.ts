// This module pulls the full place dataset + the 8.6MB places-enrichment.json
// at import time and must NEVER reach a client bundle (the PR #503 footgun).
// The boundary is held by convention: every client importer uses a type-only
// import, backed by the no-restricted-imports lint rule. NOTE: do not add
// `import "server-only"` here — the tsx data scripts (build:client-places in
// prebuild, coverage, audits) import this loader directly, and server-only's
// default export throws outside a React Server context, which breaks the
// build. server-only would need a script-side stub before it could return.
import { PLACES, type Place } from "@/data/places";
import { CATEGORY_BY_SLUG, CATEGORIES } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { eventsAtVenue, type Event } from "@/data/events";
import { haversineMeters, isValidCoord, type LngLat } from "@/lib/geo";
import { categoryFromPrimaryType } from "@/lib/categoryFromGoogle";
import { isPizzaPlace, isPlaygroundPlace } from "@/data/cravings";
import {
  isDestinationCategory,
  isNonDiscoverable,
  isRecommendable,
  SUPPRESSED_JUNK_SLUGS,
} from "@/lib/relevance";
import { getOpenStatus, isOpenNow, type OpenStatus } from "@/lib/hours";
import {
  isGooglePlaceId,
  stampPlaceProvenance,
  type Provenance,
} from "@/lib/provenance";
import { mayAssertOpenState } from "@/lib/hours-freshness";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";
import {
  activeManualPlaceStatusOverride,
  isManualPlaceClosureOverride,
} from "@/lib/place-status-overrides";
import { parseGoogleHours } from "@/lib/googleHours";
import { isKnownClosed } from "@/lib/integrations/closures";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import {
  publishableGooglePhotoAttribution,
  publishableGooglePhotoNames,
} from "@/lib/google-photo-policy";
import ENRICHMENT_RAW from "@/data/places-enrichment.json" with { type: "json" };
import DEDUP_RAW from "@/data/places-dedup.json" with { type: "json" };
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
import KNOWN_FOR_RAW from "@/data/known-for.json" with { type: "json" };
import PHOTO_SUPPRESS_RAW from "@/data/photo-suppress.json" with { type: "json" };
import LOCAL_FAVORITES_RAW from "@/data/local-favorites.json" with { type: "json" };
import SEASONAL_RAW from "@/data/seasonal-places.json" with { type: "json" };
import HOURS_REFRESH_RAW from "@/data/places-hours-refresh.json" with { type: "json" };
import BUSINESS_STATUS_RAW from "@/data/business-status.json" with { type: "json" };
import { HIDDEN_GEM_SLUGS } from "@/data/hidden-gems";
import { RELIABLE_OPEN_WINDOWS, isLikelyOpenNow } from "@/data/reliable-open-windows";
import { getLandmarkPhoto } from "@/lib/integrations/wikimedia";
import { autoFold } from "@/lib/dedupe";
import { makeResolver, patchRecord, type Overrides } from "@/lib/overrides";
import { normalizePlaceName, normalizeCity } from "@/lib/format/placeName";
import { cleanFeedText, cleanBlurbFragment } from "@/lib/format/text";
import { isJunkBlurb, stripRepeatedNamePrefix } from "@/lib/format/blurbSanity";
import { hasFieldNotes, fieldNotesFor } from "@/lib/loaders/fieldNotes";
import { amenityTags } from "@/lib/loaders/placeAmenities";
import { findMarketSchedule, type MdMarket } from "@/lib/integrations/mdFarmersMarkets";
import MD_MARKETS_RAW from "@/data/farmers-markets.json";
import {
  approvedPlaceDescription,
  type PlaceDescriptionSourceKind,
} from "@/lib/loaders/placeDescriptions";
import {
  resolveRefreshedBusinessStatus,
  type BusinessStatusRefreshEntry,
  type HoursStatusRefreshEntry,
} from "@/lib/business-status-refresh";
import {
  placementRejectionReason,
  type PlacementRejectionReason,
} from "@/lib/placement-trust";
import {
  getHoursAvailability,
  hasReliableHours,
} from "@/lib/hours-availability";
import { mayUseLikelyOpenFallback } from "@/lib/likely-open";
import { chooseCanonicalGooglePlaceId } from "@/lib/quality/enrichmentBinding";

// Official Maryland farmers-market schedule snapshot (built by
// `npm run build:farmers-markets`). Ships as [] until run, so the join below is
// a graceful no-op today.
const MD_MARKETS = MD_MARKETS_RAW as MdMarket[];

/** Real market day/hours for a category="market" place, joined by normalized
 *  name (conservative exact/stripped match, never fuzzy). {} when not a market
 *  or no confident match — so a card never shows a guessed schedule. */
function marketFields(category: string, name: string): { market_day?: string; market_hours?: string } {
  if (category !== "market" || MD_MARKETS.length === 0) return {};
  const m = findMarketSchedule(name, MD_MARKETS);
  return m ? { market_day: m.day, market_hours: m.hours } : {};
}
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
 * here overrides static enrichment hours and business status only when
 * its place_id still matches the accepted provider identity for its slug.
 * refreshed_at is the verification date the freshness policy reads. The
 * _doc key is metadata.
 */
type HoursRefreshEntry = {
  place_id: string;
  weekday_hours?: string[];
  business_status?: string;
  refreshed_at: string;
};
const HOURS_REFRESH = Object.fromEntries(
  Object.entries(HOURS_REFRESH_RAW as Record<string, unknown>).filter(
    ([k]) => !k.startsWith("_"),
  ),
) as Record<string, HoursRefreshEntry>;

const BUSINESS_STATUS = (
  BUSINESS_STATUS_RAW as {
    overrides?: Record<string, BusinessStatusRefreshEntry>;
  }
).overrides ?? {};

export function hoursRefreshForAcceptedIdentity<
  T extends { place_id?: string },
>(
  refresh: T | undefined,
  acceptedGooglePlaceId: string | undefined,
): T | undefined {
  return refresh &&
    isGooglePlaceId(acceptedGooglePlaceId) &&
    refresh.place_id === acceptedGooglePlaceId
    ? refresh
    : undefined;
}

function acceptedHoursRefresh(
  slug: string,
  acceptedGooglePlaceId: string | undefined,
): HoursRefreshEntry | undefined {
  return hoursRefreshForAcceptedIdentity(
    HOURS_REFRESH[slug],
    acceptedGooglePlaceId,
  );
}

export function resolveRefreshedBusinessStatusForAcceptedIdentity(
  business: BusinessStatusRefreshEntry | undefined,
  hours: HoursStatusRefreshEntry & { place_id?: string } | undefined,
  acceptedGooglePlaceId: string | undefined,
) {
  return resolveRefreshedBusinessStatus(
    hoursRefreshForAcceptedIdentity(business, acceptedGooglePlaceId),
    hoursRefreshForAcceptedIdentity(hours, acceptedGooglePlaceId),
  );
}

function refreshedBusinessStatus(
  slug: string,
  acceptedGooglePlaceId: string | undefined,
) {
  return resolveRefreshedBusinessStatusForAcceptedIdentity(
    BUSINESS_STATUS[slug],
    HOURS_REFRESH[slug],
    acceptedGooglePlaceId,
  );
}

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
  google_place_id?: string;
  display_name?: string;
  business_status?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | "UNKNOWN";
  weekday_hours?: string[];
  has_hours?: boolean;
  rating?: number;
  user_rating_count?: number;
  photo_names?: string[];
  photo_attributions?: GooglePhotoAttribution[];
  phone?: string;
  website?: string;
  lat?: number;
  lng?: number;
  primary_type?: string;
  editorial_summary?: string;
  review_snippet?: string;
  review_author?: string;
  review_author_uri?: string;
  review_author_photo_uri?: string;
  review_google_maps_uri?: string;
  google_maps_uri?: string;
  enriched_at?: string;
  photo_identity_verified_at?: string;
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
 * Wrong-business enrichment QUARANTINE (UX audit P0, 2026-07-07): these slugs
 * were bound to a DIFFERENT business's Google listing (a restaurant carrying a
 * law office's hours/phone/photos under a "Confirmed" badge). Every enrichment
 * read goes through enrichmentFor(), which treats a quarantined slug as
 * UNENRICHED — curated data stays, borrowed Google facts drop. The
 * enrichment-binding data-health spec fails the build if a new suspect
 * binding lands without a quarantine entry.
 */
const ENRICHMENT_QUARANTINE: ReadonlySet<string> = new Set(
  Object.entries(OV_PATCH ?? {})
    .filter(([, patch]) => patch.clearEnrichment)
    .map(([slug]) => slug),
);
function enrichmentFor(slug: string): Enrichment | undefined {
  return ENRICHMENT_QUARANTINE.has(slug) ? undefined : ENRICHMENT[slug];
}

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
        hasEnrichment: Boolean(enrichmentFor(p.slug)),
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

const PRE_GATE_PLACES: Place[] = (DEDUPE_ON ? STATIC_DEDUPED : PLACES)
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
  .map((p) => patchRecord(p, OV_PATCH));

export type PlacePlacementReview = Place & {
  rejection_reason: PlacementRejectionReason;
};

/**
 * Lossless pre-gate rejection queue. These rows never reach public surfaces,
 * municipality claiming, or paid runtime enrichment, but they remain visible
 * to the editor with their source address and exact rejection reason.
 */
const PLACEMENT_REVIEW_ROWS: PlacePlacementReview[] = PRE_GATE_PLACES.flatMap(
  (place) => {
    const rejection_reason = placementRejectionReason(place.geom);
    return rejection_reason ? [{ ...place, rejection_reason }] : [];
  },
);

// County gate (2026-06 redesign audit, ranking-trust blocker). Membership is
// decided BEFORE the automatic Urbana municipality claim. The dataset carried
// 79 out-of-county records wearing member-town labels (a Smithsburg bar tagged
// Thurmont; Boonsboro coffee shops tagged Myersville). The real county outline
// plus a documented 1.5 km straddle allowance keeps Mount Airy's cross-line
// Main Street while neighboring-county rows stay in PLACEMENT_REVIEW_ROWS.
const BASE_PLACES: Place[] = PRE_GATE_PLACES
  .filter((p) => !placementRejectionReason(p.geom))
  // Municipality assignment is downstream of county membership by contract.
  .map(claimUrbana);

// Build-time visibility into excluded places. Server-only so it
// doesn't run in the browser. Same shape as the events placement
// warning so build logs read consistently.
if (typeof window === "undefined") {
  if (PLACEMENT_REVIEW_ROWS.length > 0) {
    const sample = PLACEMENT_REVIEW_ROWS.slice(0, 5)
      .map((p) => p.slug)
      .join(", ");
    console.warn(
      `[placement] places: ${PLACEMENT_REVIEW_ROWS.length} row(s) excluded and retained for admin review (outside county outline and reviewed Mount Airy extent, or missing coord). Examples: ${sample}`,
    );
  }
}

const BASE_BY_SLUG: Record<string, Place> = (() => {
  const byCanon = Object.create(null) as Record<string, Place>;
  for (const p of BASE_PLACES) byCanon[p.slug] = p;
  const idx = Object.assign(
    Object.create(null) as Record<string, Place>,
    byCanon,
  );
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

function addGoogleIdentityOwner(
  owners: Map<string, string[]>,
  googlePlaceId: string | undefined,
  slug: string,
): void {
  if (!isGooglePlaceId(googlePlaceId)) return;
  owners.set(googlePlaceId, [...(owners.get(googlePlaceId) ?? []), slug]);
}

// Identity promotion needs a catalog-wide view. A provider ID attached to
// multiple enrichment rows, or already owned by another canonical place, is
// ambiguous and stays unpublished until the data is reconciled.
const CANONICAL_GOOGLE_ID_OWNERS = new Map<string, string[]>();
const ENRICHMENT_GOOGLE_ID_OWNERS = new Map<string, string[]>();
for (const place of BASE_PLACES) {
  addGoogleIdentityOwner(
    CANONICAL_GOOGLE_ID_OWNERS,
    place.google_place_id,
    place.slug,
  );
  addGoogleIdentityOwner(
    ENRICHMENT_GOOGLE_ID_OWNERS,
    enrichmentFor(place.slug)?.google_place_id,
    place.slug,
  );
}

type AcceptedEnrichmentIdentity = {
  googlePlaceId?: string;
  enrichment?: Enrichment;
};

/**
 * Resolve the one provider identity allowed to affect a canonical place.
 * Every downstream provider field, including rolling hours/status rows, must
 * use this same decision instead of re-reading enrichment by slug.
 */
function acceptedEnrichmentIdentity(
  place: Place,
): AcceptedEnrichmentIdentity {
  const candidate = enrichmentFor(place.slug);
  const candidateGooglePlaceId = candidate?.google_place_id;
  const enrichmentOwners = isGooglePlaceId(candidateGooglePlaceId)
    ? (ENRICHMENT_GOOGLE_ID_OWNERS.get(candidateGooglePlaceId) ?? [])
    : [];
  const canonicalOwners = isGooglePlaceId(candidateGooglePlaceId)
    ? (CANONICAL_GOOGLE_ID_OWNERS.get(candidateGooglePlaceId) ?? [])
    : [];
  const googlePlaceId = chooseCanonicalGooglePlaceId({
    existingId: place.google_place_id,
    enrichmentId: candidateGooglePlaceId,
    curatedName: place.name,
    enrichmentDisplayName: candidate?.display_name,
    enrichmentOwnerCount: enrichmentOwners.length,
    claimedByAnotherCanonicalPlace: canonicalOwners.some(
      (slug) => slug !== place.slug,
    ),
    independentlyVerified: Boolean(
      candidate?.photo_identity_verified_at,
    ),
  });
  const canonicalHasGooglePlaceId = isGooglePlaceId(place.google_place_id);
  // Older enrichment snapshots did not repeat the provider ID. They may still
  // attach when the curated record already supplies that identity. Once an
  // enrichment row declares an ID, a valid curated ID requires an exact match;
  // a missing/partner-UUID curated ID requires the guarded promotion above.
  const accepted =
    Boolean(candidate) &&
    (candidateGooglePlaceId == null
      ? canonicalHasGooglePlaceId
      : isGooglePlaceId(candidateGooglePlaceId) &&
        (canonicalHasGooglePlaceId
          ? candidateGooglePlaceId === place.google_place_id
          : candidateGooglePlaceId === googlePlaceId));

  return {
    googlePlaceId,
    enrichment: accepted ? candidate : undefined,
  };
}

/** Google-verified data merged onto a place, when available. */
export type PlaceEnriched = Omit<Provenance, "source"> & {
  /** Proxied photo URL (server route, key-safe) — first photo, for heroes */
  google_photo_url?: string;
  /** All proxied photo URLs (key-safe), for galleries */
  google_photos?: string[];
  /** Google-supplied author/source metadata for the photos above. */
  google_photo_attribution?: GooglePhotoAttribution;
  google_photo_attributions?: GooglePhotoAttribution[];
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
  review_author_uri?: string;
  review_author_photo_uri?: string;
  review_google_maps_uri?: string;
  google_maps_uri?: string;
  /** Source of the public Radius-authored description. Google summaries are
   * fetched and attributed separately at request time; they never enter this
   * field or masquerade as Radius copy. */
  description_source?: PlaceDescriptionSourceKind;
  description_source_url?: string;
  description_verified_at?: string;
  description_reviewed?: boolean;
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
  /** The single best VERIFIED local tip to surface on a LEAD card (answer /
   *  feature): the first insider note, else the parking note, clamped to one
   *  line. Field Notes are on ~5% of places, so this is the moat's actual
   *  voice — not just the "Field notes" badge — shown where there's room.
   *  Precomputed server-side so field-notes.json never ships to the client. */
  field_note_tip?: string;
  /** Official Maryland farmers-market schedule for category="market" places,
   *  joined by normalized name. Empty until `npm run build:farmers-markets`
   *  snapshots the dataset. */
  market_day?: string;
  market_hours?: string;
};

/**
 * Provenance stamp adapted to the Place type: the stamper normalizes a
 * missing source to "discovered", and the cast is sound because the
 * Place source union includes every value the stamper can produce.
 */
function stampForPlace(p: Place, verifiedAt: string): Omit<Provenance, "source"> & { source: Place["source"] } {
  const listedVerification = p.last_verified_at;
  const effectiveVerification =
    listedVerification &&
    !Number.isNaN(Date.parse(listedVerification)) &&
    Date.parse(listedVerification) > Date.parse(verifiedAt)
      ? listedVerification
      : verifiedAt;
  const { source, ...rest } = stampPlaceProvenance(p, effectiveVerification);
  return { ...rest, source: source as Place["source"] };
}

/**
 * THE blurb boundary pass. Normalize the text (entities, tags, em dashes,
 * scrape-fragment repair), then judge the result: a blurb that is still
 * scrape debris after repair (address dump, "More info about…", Facebook
 * counters, the name restated — see @/lib/format/blurbSanity) is dropped
 * to "" rather than rendered. A card with no blurb beats a card with junk.
 * Runs in both decoratePlace branches so every surface (client bundle,
 * detail page, popups) inherits one verdict.
 */
const BLURB_SENTENCE_END = /[.!?][\])}'"]*$/;
const BLURB_FINITE_VERB = /\b(?:am|are|became|began|brings?|built|can|carries?|contains?|covers?|dates?|does|draws?|features?|focuses?|grew|had|has|have|helps?|holds?|hosts?|includes?|is|keeps?|lies|lists?|makes?|offers?|opened|operates?|provides?|remains?|runs?|serves?|sells?|sits?|specializes?|stands?|started|stays?|stocks?|stretches?|supports?|uses?|was|welcomes?|were|will|works?|would)\b/i;
const BLURB_DANGLING_END = /\b(?:a|am|an|and|are|as|at|because|but|by|can|could|did|do|does|for|from|had|has|have|he|her|his|i|in|including|into|is|it|its|may|might|must|of|on|or|our|shall|she|should|such|that|the|their|these|they|this|those|through|to|was|we|were|when|where|which|while|who|will|with|without|would|you|your)\s*$/i;

/**
 * Some useful source summaries omit a final period. Missing punctuation alone
 * does not mean the text was cut off, so keep a conservative complete clause
 * and finish it here. Obvious scrape truncations still lose: dangling joiners,
 * an ellipsis, unclosed parentheses, or two sentences fused without whitespace.
 */
function finishCompleteBlurbClause(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (BLURB_SENTENCE_END.test(text)) return text;
  if (
    /(?:…|\.{2,}|[,;:/\-–—])$/.test(text) ||
    BLURB_DANGLING_END.test(text) ||
    /[.!?](?=\S)/.test(text) ||
    (text.match(/\(/g)?.length ?? 0) !== (text.match(/\)/g)?.length ?? 0) ||
    (text.match(/\[/g)?.length ?? 0) !== (text.match(/\]/g)?.length ?? 0)
  ) {
    return null;
  }

  const verb = BLURB_FINITE_VERB.exec(text);
  if (!verb || !/[A-Za-z0-9]/.test(text.slice(0, verb.index))) return null;
  return `${text}.`;
}

function boundaryBlurb(raw: string | undefined, name: string): string {
  if (!raw?.trim()) return "";
  const cleaned = cleanBlurbFragment(cleanFeedText(raw));
  if (!cleaned || isJunkBlurb(cleaned, name)) return "";
  // A few imports repeated the business name twice before the actual copy.
  // Remove only complete, exact name prefixes, with a small hard limit, then
  // judge the remainder again so an address exposed by the cleanup does not
  // become a card description.
  let concise = cleaned;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = stripRepeatedNamePrefix(concise, name);
    if (next === concise) break;
    // A real sentence often begins with the place name: "Baker Park is…".
    // Removing that subject produces broken public copy on every surface. If
    // the remainder begins like a predicate and the original sentence is
    // complete, keep one full name prefix. Repeated scrape prefixes still
    // collapse because the first pass leaves another capitalized name.
    if (
      finishCompleteBlurbClause(concise) &&
      /^(?:am|are|is|was|were|has|have|had|can|could|will|would|offers?|serves?|features?|provides?|includes?|hosts?|runs?|sits?|stands?|stocks?|focuses?|covers?|contains?|stretches?|operates?|specializes?|[a-z][a-z'’-]{2,}(?:s|ed))\b/i.test(next)
    ) {
      break;
    }
    concise = next;
  }
  // A lower-case remainder is almost always the subjectless tail of a scraped
  // name prefix. Do not ship it as if it were a sentence.
  if (/^[a-z]/.test(concise) || isJunkBlurb(concise)) return "";
  return finishCompleteBlurbClause(concise) ?? "";
}

/**
 * A provider or partner-directory description is useful evidence, but it is
 * not Radius-authored copy. Google context has its own request-scoped,
 * attributed component, and DFP rows can aggregate several outside providers.
 * Keep those permanent card blurbs empty until an approved description or a
 * deliberate human override crosses the editorial trust boundary.
 */
function permanentBlurbInput(
  p: Place,
  approvedBlurb: string | undefined,
): string {
  if (approvedBlurb) return approvedBlurb;
  if (OV_PATCH?.[p.slug]?.short_blurb !== undefined) return p.short_blurb;
  if (p.source === "dfp" || p.source === "discovered") return "";
  return p.short_blurb;
}

function permanentDescriptionSource(
  p: Place,
  approvedSource: PlaceDescriptionSourceKind | undefined,
): PlaceDescriptionSourceKind | undefined {
  if (approvedSource) return approvedSource;
  if (
    OV_PATCH?.[p.slug]?.short_blurb !== undefined ||
    p.source === "seed" ||
    p.source === "manual"
  ) {
    return "radius_editorial";
  }
  return undefined;
}

function applyEnrichment(p: Place): Place & PlaceEnriched {
  const acceptedIdentity = acceptedEnrichmentIdentity(p);
  const e = acceptedIdentity.enrichment;
  const approvedDescription = approvedPlaceDescription(p.slug, p.name);
  // A partner UUID was historically stored in this field on part of the DFP
  // import. It is not a Google Place ID and must not escape the canonical
  // loader as provider data.
  const sourcePlace = acceptedIdentity.googlePlaceId === p.google_place_id
    ? p
    : { ...p, google_place_id: acceptedIdentity.googlePlaceId };
  // Provider fields are one identity bundle. If the provider identity cannot
  // be accepted, none of its status, hours, coordinates, contact data,
  // category, ratings, reviews, or photos may leak onto the canonical place.
  if (!e)
    return {
      ...sourcePlace,
      // Provenance (data brief 4.1): stamped at this chokepoint so every
      // row that reaches a surface carries all seven fields. The un
      // enriched branch verifies against the editorial pass date.
      ...stampForPlace(sourcePlace, SEED_PLACE_VERIFIED_AT),
      // No Google profile to derive from, but an editorial hand-pick
      // still counts (and that is the whole reason hand-picks exist).
      local_favorite: resolveLocalFavorite(p.slug, undefined, undefined, p.is_verified),
      // Editorial hidden-gem flag is enrichment-independent — an
      // unenriched (or quarantined) gem is still a gem.
      hidden_gem: HIDDEN_GEM_SLUGS.has(p.slug),
      // Same boundary clean the enriched branch gets: scrape fragments
      // ("is a family-owned…") read broken regardless of enrichment, and
      // irreparable scrape debris is dropped outright.
      short_blurb: boundaryBlurb(
        permanentBlurbInput(p, approvedDescription?.blurb),
        p.name,
      ),
      description_source: permanentDescriptionSource(
        p,
        approvedDescription?.source.kind,
      ),
      description_source_url: approvedDescription?.source.url,
      description_verified_at:
        approvedDescription?.reviewed_at ?? approvedDescription?.source.fetched_at,
      description_reviewed: Boolean(approvedDescription),
    };
  // Preserve a valid canonical identity. An enrichment ID may fill a missing
  // or partner-UUID slot only when its name match is specific, the ID appears
  // on exactly one live enrichment row, and no other canonical place owns it.
  // Quarantined enrichments never reach this branch.
  const canonicalPlace = sourcePlace;
  // Google business_status overrides our seed guess — it's authoritative.
  const is_operational =
    e.business_status === "CLOSED_PERMANENTLY" ? "closed_permanently" :
    e.business_status === "CLOSED_TEMPORARILY" ? "closed_temporarily" :
    e.business_status === "OPERATIONAL" ? "operational" :
    p.is_operational;
  const photos = publishableGooglePhotoNames(
    (e.photo_names ?? []).slice(0, 8),
    e.photo_attributions,
  );
  const photoAttributions = (e.photo_attributions ?? []).filter((credit) =>
    photos.includes(credit.photo_name),
  );
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
    OV_PATCH?.[p.slug]?.geom ??
    (typeof e.lat === "number" &&
    typeof e.lng === "number" &&
    haversineMeters(p.geom, { lng: e.lng, lat: e.lat }) <= 2000
      ? { lng: e.lng, lat: e.lat }
      : p.geom);
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
  // Curated editorial voice (seed/manual) is kept. Approved, source-backed
  // Radius copy wins when present. Google summaries are intentionally NOT
  // promoted into our permanent blurb: current Google context is fetched at
  // request time and displayed in its own attributed container.
  // Boundary clean: scraped/editorial blurbs carry em dashes (against the
  // no-em-dash voice rule), stray entities, and tags. cleanFeedText normalizes
  // them (— -> ", ") and is a no-op on already-clean curated text, so both the
  // client bundle and the server detail page render consistent, on-voice copy.
  const rawBlurb = permanentBlurbInput(p, approvedDescription?.blurb);
  const short_blurb = boundaryBlurb(rawBlurb, p.name);
  // Hours: a hand-curated structured schedule (seed/manual, e.g. the
  // parks) always wins; otherwise parse Google's weekday strings into the
  // structured shape getOpenStatus needs. THIS is the line that lifts
  // open-now coverage from ~3.6% (curated only) to ~80% — the verified
  // hours were always in the enrichment; nothing turned the
  // "Monday: 9:00 AM - 5:00 PM" strings into { mon: [{ open, close }] }.
  const hours = p.hours ?? parseGoogleHours(e.weekday_hours);
  return {
    ...canonicalPlace,
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
    // Google photo bytes are never selected from the old permanent Blob
    // mirror. The same-origin proxy protects the API key while its no-store
    // response prevents first-party/browser/CDN retention.
    google_photo_url: photos[0] ? photoProxy(photos[0], 800, p.slug) : undefined,
    google_photos: photos.map((n) => photoProxy(n, 800, p.slug)),
    google_photo_attribution: photos[0]
      ? publishableGooglePhotoAttribution(photos[0], photoAttributions)
      : undefined,
    google_photo_attributions: photoAttributions.length > 0 ? photoAttributions : undefined,
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
    review_author_uri: e.review_author_uri,
    review_author_photo_uri: e.review_author_photo_uri,
    review_google_maps_uri: e.review_google_maps_uri,
    google_maps_uri: e.google_maps_uri,
    description_source: permanentDescriptionSource(
      p,
      approvedDescription?.source.kind,
    ),
    description_source_url: approvedDescription?.source.url,
    description_verified_at:
      approvedDescription?.reviewed_at ?? approvedDescription?.source.fetched_at,
    description_reviewed: Boolean(approvedDescription),
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
      const prov = stampForPlace(
        canonicalPlace,
        e.enriched_at ?? ENRICHMENT_VERIFIED_AT,
      );
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
// Factual by category. OUTDOOR = weather-dependent, the places a rainy-day
// answer must EXCLUDE (parks/trails/golf/playgrounds, and farms/orchards/PYO).
// INDOOR = under-a-roof destinations a rainy-day plan can lean on: the
// cultural venues (museum/library/gallery/theater) plus the sit-inside
// commerce a local would actually suggest when it's pouring (a coffee shop,
// a bakery, a bookstore). Deliberately NOT every indoor category — food/bars/
// shopping are already discoverable by their own strong categories, so this
// stays a coherent "somewhere to duck in" set, not "everything with walls."
const OUTDOOR_CATS = new Set(["park", "trail", "playground", "golf", "agritourism"]);
const INDOOR_CATS = new Set(["museum", "library", "gallery", "theater", "coffee", "bakery", "book-store"]);
export function deriveTags(category: string, tags?: string[]): string[] {
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
  const hasHoursPatch = Boolean(OV_PATCH?.[p.slug]?.hours);
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
  const e = acceptedEnrichmentIdentity(p).enrichment;
  const hours_source: Place["hours_source"] = hasHoursPatch
    ? "manual_override"
    : e?.has_hours
      ? "google_places"
      : enriched.hours && enriched.hours_verified
        ? "manual_override"
        : undefined;
  const hours_updated_at =
    hasHoursPatch
      ? p.hours_updated_at
      : hours_source === "google_places"
      ? e?.enriched_at
      : hours_source === "manual_override"
        ? p.hours_updated_at
        : undefined;
  // Rolling refresh override (4.3): a refreshed row carries newer Google
  // hours and status than the static enrichment, so it wins both the
  // schedule and the verification date — EXCEPT when a human hours patch
  // exists. A curated hours correction (places-overrides.json, the
  // "PM-entered-as-AM" typo fix) must win over the Google refresh, otherwise
  // the next refresh that adds this slug re-introduces the very typo the patch
  // fixed. enriched.hours already carries the patched schedule (applyEnrichment
  // takes p.hours first), so we just suppress the refresh override here.
  const refresh = acceptedHoursRefresh(p.slug, enriched.google_place_id);
  const refreshedHours = !hasHoursPatch && refresh?.weekday_hours
    ? parseGoogleHours(refresh.weekday_hours)
    : undefined;
  const hours = refreshedHours ?? enriched.hours;
  const hoursVerified = refreshedHours ? true : (enriched.hours_verified ?? false);
  const hoursVerifiedAt = refreshedHours ? refresh?.refreshed_at : hours_updated_at;
  const mayAssertHours =
    mayAssertOpenState(hoursVerified, hoursVerifiedAt, now) &&
    mayPublishVisitabilityHours(p.slug, hours, now);
  const manualStatus = activeManualPlaceStatusOverride(p.slug, now);
  const refreshedStatus = refreshedBusinessStatus(
    p.slug,
    enriched.google_place_id,
  );
  if (manualStatus) {
    enriched.is_operational = manualStatus.status;
  } else if (refreshedStatus) {
    enriched.is_operational = refreshedStatus.status;
  }
  return {
    ...enriched,
    // Category-derived tags (outdoor/indoor/kids) UNION the place's own tags
    // UNION its structured Google amenities (outdoor-seating, dog-friendly,
    // reservations, …) — the last is [] until `npm run enrich:amenities` is
    // run, so this is a no-op today and lights up the amenity facets once the
    // data lands. All three feed the category-page facet filters.
    tags: [...new Set([...deriveTags(enriched.category, enriched.tags), ...amenityTags(p.slug)])],
    // Stale schedules are not merely marked unverified: hide them from every
    // downstream consumer so no direct hours renderer can accidentally turn an
    // old schedule into a current promise.
    hours: mayAssertHours ? hours : undefined,
    hours_verified: mayAssertHours,
    // The detail page historically fell back to Google's display strings when
    // structured hours were suppressed. Clear both representations at this
    // canonical boundary so an unreviewed 24/7 or stale schedule cannot leak
    // back onto a place page as seven raw "Open 24 hours" rows.
    google_hours:
      mayAssertHours && !hasHoursPatch ? enriched.google_hours : undefined,
    hours_source: refreshedHours ? ("google_places" as const) : hours_source,
    hours_updated_at: hoursVerifiedAt,
    // The one decision point of the hours policy: open and closed states render
    // only from recently verified hours.
    open_status: getOpenStatus(
      mayAssertHours ? hours : undefined,
      { verified: mayAssertHours },
      now,
    ),
    distance_m: origin ? haversineMeters(origin, enriched.geom) : undefined,
    field_notes: hasFieldNotes(p.slug),
    // Standing happy-hour figure only (e.g. "25% OFF") — never a day-specific
    // deal, so a static card can't lie about "today." Only when the deal names a
    // SINGLE figure: a lone "$1 OFF" pulled from a multi-part deal would strand
    // its subject and mislead. Undefined otherwise; the card keeps the generic tag.
    deal_hook: figureCount(fieldNotesFor(p.slug)?.happy_hour?.details) === 1
      ? (dealHook(fieldNotesFor(p.slug)?.happy_hour?.details) ?? undefined)
      : undefined,
    // Boundary clean (em-dash voice rule): a curated field-note tip may carry
    // an em dash; cleanFeedText converts it and is a no-op on clean text.
    field_note_tip: ((tip) => (tip ? cleanFeedText(tip) : tip))(fieldNoteTip(p.slug)),
    ...marketFields(enriched.category, enriched.name),
  };
}

/** The single best verified local tip for a lead card: the first insider
 *  note, else the parking note, clamped to one line at a word boundary.
 *  Surfaces the Field Notes moat's actual voice (not just the badge); kept
 *  server-side so field-notes.json never reaches the client bundle. */
function fieldNoteTip(slug: string): string | undefined {
  const n = fieldNotesFor(slug);
  const raw = (n?.insider?.[0]?.text ?? n?.parking?.text)?.trim();
  if (!raw) return undefined;
  if (raw.length <= 120) return raw;
  const cut = raw.slice(0, 120);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:\s]+$/, "") + "…";
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
  const {
    google_photos: _gp,
    google_photo_attribution: _gpaOne,
    google_photo_attributions: _gpa,
    google_hours: _gh,
    ...rest
  } = p as PlaceCardData & {
    google_photos?: unknown;
    google_photo_attribution?: unknown;
    google_photo_attributions?: unknown;
    google_hours?: unknown;
  };
  void _gp;
  void _gpaOne;
  void _gpa;
  void _gh;
  return rest as PlaceCardData;
}

/**
 * The nearby decision surface needs enough data to rank and open an immediate
 * answer card, but not review prose, raw hours, or detail-only link metadata for
 * every eligible place in the county. PlaceSheet fills missing live details for
 * the one record a person opens.
 */
export function slimForNearby(p: PlaceCardData): PlaceCardData {
  const listPlace = slimForList(p);
  const {
    description: _description,
    review_snippet: _reviewSnippet,
    review_author: _reviewAuthor,
    review_author_uri: _reviewAuthorUri,
    review_author_photo_uri: _reviewAuthorPhoto,
    review_google_maps_uri: _reviewMaps,
    hours: _hours,
    amenities: _amenities,
    ...rest
  } = listPlace;
  void _description;
  void _reviewSnippet;
  void _reviewAuthor;
  void _reviewAuthorUri;
  void _reviewAuthorPhoto;
  void _reviewMaps;
  void _hours;
  void _amenities;
  return rest as PlaceCardData;
}

/** Share of places that can actually assert an open/closed state for the
 * current build. Counting provenance alone kept Open-now visible even when a
 * strict freshness pass had removed every materialized schedule. */
export function hoursCoverage(places: PlaceCardData[]): number {
  return getHoursAvailability(places).coverage;
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
  return HOURS_GATE && !getHoursAvailability(places).enabled;
}

export function getPlaceBySlug(slug: string, origin?: LngLat, now: Date = new Date()): PlaceDetail | null {
  const p = BASE_BY_SLUG[slug];
  if (!p) return null;
  const decorated = decoratePlace(p, origin, now);

  const nearby_places = publicPlaces()
    .filter((x) => x.slug !== p.slug)
    .map((x) => decoratePlace(x, p.geom, now))
    // "Nearby" is a recommendation surface, not a raw proximity dump.
    // Apply the gate after enrichment because the institutional primary type
    // comes from Google, not the raw DFP row.
    .filter(isRecommendable)
    // This is a "what pairs with this stop?" surface, not a literal nearest-
    // coordinate dump. Appointment services and utilities remain available in
    // Search and Map, but a coffee page should not lead with a hair salon just
    // because its door is 40 feet closer. Favor the same category first, then
    // other destinations in the same chapter, while preserving walkability as
    // the dominant signal.
    .filter((candidate) =>
      isDestinationCategory(
        CATEGORY_BY_SLUG[candidate.category]?.parent ?? candidate.category,
      ),
    )
    .sort(
      (a, b) =>
        nearbyContextScore(p.category, a) - nearbyContextScore(p.category, b),
    )
    .slice(0, 6);

  return {
    ...decorated,
    category_name: CATEGORY_BY_SLUG[p.category]?.name ?? p.category,
    municipality_name: MUNICIPALITY_BY_SLUG[p.municipality]?.name ?? p.municipality,
    nearby_places,
    upcoming_events: eventsAtVenue(p.slug),
  };
}

function nearbyContextScore(
  anchorCategory: string,
  candidate: Pick<PlaceCardData, "category" | "distance_m">,
): number {
  const anchorParent = CATEGORY_BY_SLUG[anchorCategory]?.parent ?? anchorCategory;
  const candidateParent =
    CATEGORY_BY_SLUG[candidate.category]?.parent ?? candidate.category;
  const affinity =
    candidate.category === anchorCategory
      ? -200
      : candidateParent === anchorParent
        ? -100
        : 0;
  return (candidate.distance_m ?? Infinity) + affinity;
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
   * Ranking profile. Default (undefined) uses the balanced curation,
   * proximity, and open-status blend. "visitor"
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

// Matched against a place's leaf category, so every entry has to be one.
// "cafe" and "breakfast" are not categories in the taxonomy at all, and
// "outdoors" is a real PARENT slug that no place is ever filed under, so all
// three matched nothing while reading as coverage. category-sets.spec.ts
// locks this against the live catalog.
const MOMENT_FIT: Record<"morning" | "midday" | "evening", ReadonlySet<string>> = {
  morning: new Set(["coffee", "bakery", "park", "trail", "market"]),
  midday: new Set([
    "restaurant", "coffee", "museum", "gallery", "park", "trail",
    "market", "shopping", "playground", "family",
  ]),
  evening: new Set([
    "restaurant", "bar", "brewery", "winery", "pizza", "music", "theater", "gallery",
    // The county's tasting rooms keep evening hours like any bar does.
    "distillery",
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
  // A slug-keyed, source-backed human decision wins over Google during its
  // reviewed window. Safety closures stay active after a missed review;
  // operational corrections expire instead of asserting that a place is open
  // forever. Exact slugs prevent either decision affecting a same-name place.
  const manualStatus = activeManualPlaceStatusOverride(p.slug);
  if (manualStatus?.status === "operational") return true;
  if (isManualPlaceClosureOverride(manualStatus)) return false;
  if (isKnownClosed(p.name)) return false; // manual override of last resort
  const acceptedIdentity = acceptedEnrichmentIdentity(p);
  const refreshedStatus = refreshedBusinessStatus(
    p.slug,
    acceptedIdentity.googlePlaceId,
  )?.status;
  if (refreshedStatus) {
    return (
      refreshedStatus !== "closed_permanently" &&
      refreshedStatus !== "closed_temporarily"
    );
  }
  // Google enrichment is the SOURCE OF TRUTH for closure. DFP-scraped
  // records hardcode is_operational: "operational" at load time so the
  // raw Place field can lie (Serendipity Market, Brass Copper Shop,
  // …). Read the live enrichment business_status first; only fall
  // back to the Place field when there is no enrichment.
  const e = acceptedIdentity.enrichment;
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
  return !isNonDiscoverable(enrichmentFor(p.slug)?.primary_type);
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
// A park or trail is a destination regardless of what Google knows about it —
// there is no such thing as a low-value park. Exempt these from the thin-data
// prune so landmarks like Carroll Creek Promenade can't vanish from the guide
// for lack of a Google rating/photo. Kept intentionally tight to unambiguous
// destination categories (not civic/museum, which the coverage audit surfaces
// on /admin/data-health for case-by-case rescue instead).
const ALWAYS_SUBSTANTIVE_CATEGORIES = new Set(["park", "trail"]);

export function isSubstantive(p: Place): boolean {
  if (!PRUNE_THIN_ON) return true;
  if (OV_PATCH?.[p.slug]?.includeWithoutMedia) return true;
  if (p.source !== "dfp" && p.source !== "google") return true;
  if (ALWAYS_SUBSTANTIVE_CATEGORIES.has(p.category)) return true;
  // Any real signal keeps it: a Google rating, a photo of ANY kind
  // (Google enrichment, seed hero, or a Wikimedia landmark match), or
  // a real editorial summary. Hidden only when it has NONE of these —
  // a name + category + point and nothing else.
  if (p.hero_image || getLandmarkPhoto(p.slug)) return true;
  const e = enrichmentFor(p.slug);
  if (!e) return false;
  return Boolean(
    e.rating ||
      (e.photo_names && e.photo_names.length > 0) ||
      (e.editorial_summary && e.editorial_summary.trim().length > 0),
  );
}

export type PlaceRefreshIdentity = {
  slug: string;
  google_place_id: string;
};

/**
 * Canonical provider identities for status and hours refreshes.
 *
 * This is deliberately upstream of live business status and seasonal
 * visibility. A place hidden because Google most recently reported it closed
 * must remain refreshable so a later reopening can be discovered, and an
 * off-season place must keep its identity until its next season. Structural
 * public-catalog boundaries still apply: dedupe/removal/county placement are
 * already resolved in BASE_PLACES, while junk, relevance, substance, and the
 * accepted-enrichment identity guard are enforced here.
 */
export function canonicalPlaceRefreshIdentities(): PlaceRefreshIdentity[] {
  return BASE_PLACES
    .filter((place) => !SUPPRESSED_JUNK_SLUGS.has(place.slug))
    .filter(isDiscoverable)
    .filter(isSubstantive)
    .filter((place) => isValidCoord(place.geom))
    .flatMap((place) => {
      const googlePlaceId = acceptedEnrichmentIdentity(place).googlePlaceId;
      return isGooglePlaceId(googlePlaceId)
        ? [{ slug: place.slug, google_place_id: googlePlaceId }]
        : [];
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

/**
 * Canonical targets for paid business-status rechecks.
 *
 * This intentionally differs from publicPlaces(): a place hidden only because
 * an accepted provider profile says it is closed remains eligible so a later
 * reopening can be discovered. Human safety closures still win, while a
 * reviewed operational correction remains in the rotation so the provider
 * can eventually repair its status. Every other public-catalog quality
 * boundary remains in force.
 */
export function canonicalBusinessStatusRefreshCandidates(
  now: Date = new Date(),
): Place[] {
  return BASE_PLACES
    .filter((place) => !SUPPRESSED_JUNK_SLUGS.has(place.slug))
    .filter(
      (place) =>
        !isManualPlaceClosureOverride(
          activeManualPlaceStatusOverride(place.slug, now),
        ),
    )
    .filter((place) => !isKnownClosed(place.name))
    .filter(
      (place) =>
        !(
          (place.source === "manual" || place.source === "seed") &&
          (place.is_operational === "closed_temporarily" ||
            place.is_operational === "closed_permanently")
        ),
    )
    .filter(isDiscoverable)
    .filter(isSubstantive)
    .filter((place) => isValidCoord(place.geom))
    .filter((place) => isInSeason(place, now));
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
 * Coverage safety net: places that clear junk/relevance/coords/season but are
 * hidden from every public surface ONLY because Google says they're closed
 * (isOperational) or because they carry no Google rating/photo/summary
 * (isSubstantive). The intentional B2B long-tail (isDiscoverable) is excluded —
 * that's a deliberate hide, not a coverage gap.
 *
 * These drops are otherwise INVISIBLE (unlike off-bbox coords, which already
 * surface via getNeedsReviewPlaces). Surfacing them lets an editor rescue the
 * false positives — a curated restaurant wrongly flagged closed by a
 * misattributed Google listing, or a real park/civic place with thin Google
 * data — via a places-overrides patch (hero_image/blurb to clear "thin",
 * clearGoogle to clear a bad closure). Server-only: reads the enrichment map.
 */
export type HiddenFromDiscovery = {
  slug: string;
  name: string;
  category: string;
  municipality: string;
  source: Place["source"];
  /** "closed" = failed isOperational; "thin" = failed isSubstantive. */
  reason: "closed" | "thin";
};

export function getHiddenFromDiscovery(): HiddenFromDiscovery[] {
  return BASE_PLACES
    .filter((p) => !SUPPRESSED_JUNK_SLUGS.has(p.slug))
    .filter(isDiscoverable) // exclude the intended B2B hides
    .filter((p) => isValidCoord(p.geom))
    .filter((p) => isInSeason(p))
    .filter((p) => !isOperational(p) || !isSubstantive(p))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      municipality: p.municipality,
      source: p.source,
      reason: !isOperational(p) ? ("closed" as const) : ("thin" as const),
    }));
}

/**
 * Places whose coordinate is missing, malformed, or outside the Frederick
 * County catalog area. They are excluded from public surfaces but preserved
 * here with source, address, declared municipality, and rejection reason.
 */
export function getNeedsReviewPlaces(): PlacePlacementReview[] {
  return PLACEMENT_REVIEW_ROWS;
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
  if (!p) return undefined;
  return !SUPPRESSED_JUNK_SLUGS.has(p.slug) &&
    isOperational(p) &&
    isDiscoverable(p) &&
    isSubstantive(p) &&
    isValidCoord(p.geom) &&
    isInSeason(p)
    ? p
    : undefined;
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
  return publicPlaces()
    .filter((p) => p.slug in RELIABLE_OPEN_WINDOWS && isLikelyOpenNow(p.slug, now))
    .map((p) => decoratePlace(p, origin, now))
    .filter((p) => mayUseLikelyOpenFallback(p.open_status))
    .map((p) => ({ ...p, open_confidence: "likely" as const }))
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
}

/** Leading honorific on a personal-practice listing ("Dr Atul Purohit"). */
const PERSON_HONORIFIC = /^(?:dr|mr|mrs|ms)\.?$/i;
/** Trailing practitioner credential ("Gaffar Syed MD", "Adam J Frieder DDS"). */
const PERSON_CREDENTIAL =
  /^(?:md|dds|dmd|do|od|pa|phd|psyd|lcsw-?c?|lpc|lcpc|crnp|cpa|esq|jr|sr)$/i;
/** Google primaryTypes that mean an individual practice, not a storefront. */
const PRACTICE_TYPE =
  /doctor|dentist|physio|psycholog|psychiatr|counsel|therap|medical|clinic|massage|acupunct|chiroprac|lawyer|attorney|insurance|real_estate/i;
/** Business nouns that rescue a two-word name from looking like a person
 *  ("Appalachian Bodywork", "Kindred Nutrition", "Gale House"). */
const BUSINESS_NOUN = new Set([
  "bodywork", "massage", "nutrition", "counseling", "psychotherapy",
  "therapy", "reflexology", "wellness", "acupuncture", "chiropractic",
  "dental", "dentistry", "aesthetics", "beauty", "salon", "spa", "studio",
  "yoga", "pilates", "fitness", "crossfit", "health", "house", "center",
  "clinic", "group", "associates", "partners", "care", "medicine",
  "pediatrics", "dermatology",
]);

/**
 * A discovered row whose NAME reads as a bare person ("Noah Stevens",
 * "Nicole K Albertson") — a solo-practitioner listing, not a recognizable
 * business. Used ONLY to keep the /beta open-now highlight SAMPLE honest;
 * such rows still count, map, and search normally. Requires BOTH a
 * person-shaped name (2-3 capitalized name words, optional initial,
 * optional Dr/MD-style credential) AND practice-flavored typing, so
 * two-word real businesses ("Smoke Signals", "Rare Morsel", "Odin
 * Crossfit") are never excluded.
 */
function looksLikeBarePersonName(
  name: string,
  primaryType?: string,
  category?: string,
): boolean {
  let toks = name.trim().split(/\s+/).map((t) => t.replace(/[.,]+$/, ""));
  let credentialed = false;
  while (toks.length > 0 && PERSON_HONORIFIC.test(toks[0])) {
    toks = toks.slice(1);
    credentialed = true;
  }
  while (toks.length > 0 && PERSON_CREDENTIAL.test(toks[toks.length - 1])) {
    toks = toks.slice(0, -1);
    credentialed = true;
  }
  if (toks.length < 1 || toks.length > 3) return false;
  if (toks.some((t) => BUSINESS_NOUN.has(t.toLowerCase()))) return false;
  const nameWord = /^[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?$/;
  const initial = /^[A-Z]$/;
  const words = toks.filter((t) => nameWord.test(t)).length;
  const initials = toks.filter((t) => initial.test(t)).length;
  if (words + initials !== toks.length) return false;
  // "Dr Elise" is person-shaped on the honorific alone; without a
  // credential it takes two name words AND a practice type to call it.
  if (credentialed) return words >= 1;
  if (words < 2 || initials === toks.length) return false;
  return primaryType
    ? PRACTICE_TYPE.test(primaryType)
    : category === "wellness" || category === "health";
}

export type OpenNowProofModule =
  | "eat-drink"
  | "things-to-do"
  | "shop-local";

export type OpenNowProofPick = {
  slug: string;
  name: string;
  module: OpenNowProofModule;
};

export type OpenNowSnapshot = {
  /** The exact instant used to decorate every schedule in this snapshot. */
  asOf: string;
  /** Complete, untruncated county inventory with recently confirmed open hours. */
  places: PlaceCardData[];
  /** Small editorial proof, deliberately separate from the inventory count. */
  worthConsidering: OpenNowProofPick[];
  count: number;
};

const OPEN_NOW_PROOF_MODULES: ReadonlyArray<{
  key: OpenNowProofModule;
  categories: ReadonlySet<string>;
}> = [
  {
    key: "eat-drink",
    categories: new Set([
      "restaurant",
      "coffee",
      "bar",
      "brewery",
      "winery",
      "distillery",
      "bakery",
      "pizza",
      "ice-cream",
      "food-truck",
    ]),
  },
  {
    key: "things-to-do",
    categories: new Set([
      "park",
      "trail",
      "playground",
      "golf",
      "agritourism",
      "museum",
      "theater",
      "music",
      "public-art",
      "tours",
      "family",
      "sports",
    ]),
  },
  {
    key: "shop-local",
    // Broad "shopping" and "gallery" rows contain framing studios, agencies,
    // and directory imports. Keep those searchable and in the honest open
    // inventory, but use only unmistakable leisure categories as cover proof.
    categories: new Set(["antiques", "book-store", "market"]),
  },
];

const NON_LEISURE_PROOF_TYPE_RE =
  /\b(?:agency|association|clinic|consultant|counsel|crossfit|dentist|doctor|fitness|government|gym|health|hospital|insurance|lawyer|medical|organization|physio|psych|real[_ ]estate|therapy|university)\b/i;
const NON_LEISURE_PROOF_NAME_RE =
  /\b(?:agency|associates|clinic|consulting|counseling|crossfit|dental|dentistry|fitness|gallery|government|health|insurance|medical|psychological|strateg(?:y|ies)|therapy)\b/i;

export function openNowProofModule(
  place: Pick<PlaceCardData, "category" | "name" | "primary_type">,
): OpenNowProofModule | null {
  if (
    NON_LEISURE_PROOF_TYPE_RE.test(place.primary_type ?? "") ||
    NON_LEISURE_PROOF_NAME_RE.test(place.name)
  ) {
    return null;
  }
  return (
    OPEN_NOW_PROOF_MODULES.find(({ categories }) =>
      categories.has(place.category),
    )?.key ?? null
  );
}

function compareOpenNowProofCandidates(
  a: PlaceCardData,
  b: PlaceCardData,
): number {
  return (
    Number(Boolean(b.local_favorite)) - Number(Boolean(a.local_favorite)) ||
    b.feature_score - a.feature_score ||
    (b.google_rating ?? 0) - (a.google_rating ?? 0) ||
    (b.google_rating_count ?? 0) - (a.google_rating_count ?? 0) ||
    a.name.localeCompare(b.name, "en-US") ||
    a.slug.localeCompare(b.slug, "en-US")
  );
}

export function selectOpenNowProofPicks(
  open: readonly PlaceCardData[],
  limit: number,
): OpenNowProofPick[] {
  if (limit <= 0) return [];

  const candidates = open
    .filter((place) => !ENRICHMENT_QUARANTINE.has(place.slug))
    .filter(
      (place) =>
        place.source === "seed" ||
        place.source === "manual" ||
        !looksLikeBarePersonName(
          place.name,
          place.primary_type,
          place.category,
        ),
    )
    .map((place) => ({
      place,
      module: openNowProofModule(place),
    }))
    .filter(
      (
        candidate,
      ): candidate is { place: PlaceCardData; module: OpenNowProofModule } =>
        candidate.module !== null,
    );

  const byModule = new Map<
    OpenNowProofModule,
    Array<{ place: PlaceCardData; module: OpenNowProofModule }>
  >();
  for (const proofModule of OPEN_NOW_PROOF_MODULES) {
    byModule.set(
      proofModule.key,
      candidates
        .filter((candidate) => candidate.module === proofModule.key)
        .sort((a, b) =>
          compareOpenNowProofCandidates(a.place, b.place),
        ),
    );
  }

  const selected: Array<{
    place: PlaceCardData;
    module: OpenNowProofModule;
  }> = [];
  const selectedSlugs = new Set<string>();

  // First pass: one useful place from each user-facing module. This prevents
  // a high-volume category such as restaurants from swallowing the proof.
  for (const proofModule of OPEN_NOW_PROOF_MODULES) {
    const pick = byModule.get(proofModule.key)?.[0];
    if (!pick || selected.length >= limit) continue;
    selected.push(pick);
    selectedSlugs.add(pick.place.slug);
  }

  // Fill a larger requested sample deterministically, preferring a new
  // category before repeating one already represented.
  const representedCategories = new Set(
    selected.map(({ place }) => place.category),
  );
  const remaining = candidates
    .filter(({ place }) => !selectedSlugs.has(place.slug))
    .sort((a, b) => compareOpenNowProofCandidates(a.place, b.place));
  for (const preferNewCategory of [true, false]) {
    for (const candidate of remaining) {
      if (selected.length >= limit) break;
      if (selectedSlugs.has(candidate.place.slug)) continue;
      const isNewCategory = !representedCategories.has(
        candidate.place.category,
      );
      if (isNewCategory !== preferNewCategory) continue;
      selected.push(candidate);
      selectedSlugs.add(candidate.place.slug);
      representedCategories.add(candidate.place.category);
    }
  }

  return selected.map(({ place, module }) => ({
    slug: place.slug,
    name: place.name,
    module,
  }));
}

/**
 * Assemble the public snapshot from an already-confirmed-open population.
 * Keeping this step pure lets the editorial proof contract be tested without
 * pinning CI to whichever businesses happen to have fresh provider hours on a
 * particular nightly data snapshot.
 */
export function buildOpenNowSnapshot(
  open: readonly PlaceCardData[],
  now: Date,
  proofLimit = 3,
): OpenNowSnapshot {
  const places = [...open];
  return {
    asOf: now.toISOString(),
    places,
    worthConsidering: selectOpenNowProofPicks(places, proofLimit),
    count: places.length,
  };
}

/**
 * The canonical county-wide open-now snapshot. Every public county count,
 * the /beta proof, and /open-now consume this exact untruncated population
 * and its single as-of instant. The inventory includes every recommendable,
 * discoverable place whose recently checked schedule confirms it is open.
 * `worthConsidering` is a separate, stricter editorial sample; a gym,
 * agency, clinic, or civic office may remain findable without becoming the
 * product's idea of what someone should do.
 */
export function getOpenNowSnapshot(
  now: Date = new Date(),
  origin?: LngLat,
  proofLimit = 3,
): OpenNowSnapshot {
  const places = rankPlaces({ origin, now })
    .filter(isRecommendable)
    .filter((place) => isOpenNow(place.open_status));
  return buildOpenNowSnapshot(places, now, proofLimit);
}

/**
 * THE county-wide open-now count. Kept as a small compatibility helper for
 * Today; the timestamped snapshot above remains the source of truth.
 */
export function countOpenNow(now: Date = new Date()): number {
  return getOpenNowSnapshot(now, undefined, 0).count;
}

/**
 * Compatibility shape for older server consumers. The count is the complete
 * snapshot inventory; the names are the same module-diverse leisure proof
 * used by the beta cover. Professional and clinical rows remain in the count
 * and catalog but cannot become editorial examples.
 */
export function openNowHighlights(
  limit: number,
  now: Date = new Date(),
): { count: number; names: string[]; asOf: string } {
  const snapshot = getOpenNowSnapshot(now, undefined, limit);
  return {
    count: snapshot.count,
    names: snapshot.worthConsidering.map((pick) => pick.name),
    asOf: snapshot.asOf,
  };
}

/**
 * Total + open-right-now counts of public recommendable places within
 * `radiusM` of each point. One decorate pass over the catalog, then a
 * cheap haversine per point — built for the /beta cover flight, where
 * every drone frame states what Radius knows about the ground below it.
 */
export function nearbyOpenCounts(
  points: ReadonlyArray<{ lat: number; lng: number }>,
  radiusM: number,
  now: Date = new Date(),
): { total: number; reliable: number; open: number }[] {
  const decorated = publicPlaces()
    .filter(isRecommendable)
    .map((p) => decoratePlace(p, undefined, now));
  return points.map((pt) => {
    let total = 0;
    let reliable = 0;
    let open = 0;
    for (const p of decorated) {
      if (haversineMeters({ lng: pt.lng, lat: pt.lat }, p.geom) > radiusM) continue;
      total++;
      if (hasReliableHours(p, now)) reliable++;
      if (isOpenNow(p.open_status)) open++;
    }
    return { total, reliable, open };
  });
}

export function rankPlaces(ctx: RankingContext = {}): PlaceCardData[] {
  const now = ctx.now ?? new Date();
  let results = publicPlaces()
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
    // Pizza is name-evidenced, not just category-evidenced: Google's
    // primary_type files most local pizzerias under "restaurant" /
    // "italian_restaurant", so /category/pizza showed 17 of the catalog's
    // 23 pizza places. Same canonical matcher the map's Pizza facet uses
    // (isPizzaPlace) — a no-op for every other category.
    const wantsPizza = match.has("pizza");
    const wantsPlayground = match.has("playground");
    results = results.filter(
      (p) =>
        match.has(p.category) ||
        (p.subcategories ?? []).some((s) => match.has(s)) ||
        (wantsPizza && isPizzaPlace(p)) ||
        (wantsPlayground && isPlaygroundPlace(p)),
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
      // Every axis must live on the same 0–1 scale. The old expression used
      // feature_score (0–10) beside 0–1 proximity/open signals, so curation
      // overwhelmed location and hours even when the user shared a precise
      // origin. curationScore normalizes it and preserves the small,
      // source-backed local-favorite lift.
      const sa = curationScore(a.feature_score, a.local_favorite) * 0.4 +
        proximityScore(a.distance_m) * 0.3 +
        openScore(a.open_status) * 0.3;
      const sb = curationScore(b.feature_score, b.local_favorite) * 0.4 +
        proximityScore(b.distance_m) * 0.3 +
        openScore(b.open_status) * 0.3;
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
  return publicPlaces()
    .map((p) => decoratePlace(p, origin, now))
    .filter((p) => (p.distance_m ?? Infinity) <= meters)
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
}
