/**
 * Google Places API (New) client — authoritative status, hours, rating, photos.
 *
 * Two resolution paths:
 *   1. We already have a `places/ChIJ…` id  → Place Details directly (cheapest)
 *   2. We only have name + address          → Text Search to resolve the id,
 *                                              then Place Details
 *
 * Everything is gated on GOOGLE_PLACES_API_KEY. Without it, every function
 * returns null and callers fall back to the existing seed/DFP data.
 *
 * Pricing-aware: we request only the field masks we use. Place Details with
 * the "Pro + Enterprise" fields (hours, rating) is billed per the field mask,
 * so we keep the mask tight.
 *
 * Caching: this client always uses `no-store`. Callers must not persist Google
 * content unless a specific Maps Platform term permits that field. Place IDs
 * are the durable identifier; photo names in particular can expire and must
 * be obtained from a current Places response.
 */

import type { OperationalStatus } from "@/data/places";
import { hasIdentitySubfacilityConflict } from "@/lib/quality/enrichmentBinding";

const BASE = "https://places.googleapis.com/v1";

export type GoogleBusinessStatus =
  | "OPERATIONAL"
  | "CLOSED_TEMPORARILY"
  | "CLOSED_PERMANENTLY"
  | "UNKNOWN";

/**
 * Maps Google businessStatus to our OperationalStatus. UNKNOWN becomes
 * needs_verification (not a closed state), so a missing Google answer
 * never hides a place. Only an explicit Google closure suppresses it.
 */
export function googleStatusToOperational(
  gs: GoogleBusinessStatus,
): OperationalStatus {
  switch (gs) {
    case "CLOSED_PERMANENTLY":
      return "closed_permanently";
    case "CLOSED_TEMPORARILY":
      return "closed_temporarily";
    case "OPERATIONAL":
      return "operational";
    default:
      return "needs_verification";
  }
}

export type PlaceEnrichment = {
  google_place_id: string;
  business_status: GoogleBusinessStatus;
  display_name?: string;
  formatted_address?: string;
  /** Weekly hours as the human-readable descriptions Google returns */
  weekday_hours?: string[];
  /** True if we got real hours back */
  has_hours: boolean;
  rating?: number;
  user_rating_count?: number;
  /** Photo resource names — turn into URLs with photoUrl() */
  photo_names: string[];
  /** Attribution metadata returned alongside each Google photo. Keep this
   *  paired with its resource name so every rendered photo can credit its
   *  author and link to its Google Maps source when those fields exist. */
  photo_attributions: GooglePhotoAttribution[];
  phone?: string;
  website?: string;
  lat?: number;
  lng?: number;
  /** Google's authoritative primary type, e.g. "coffee_shop",
   *  "lodging", "church" — drives the category auto-correction. */
  primary_type?: string;
  /** Google's real one-line description — replaces placeholder blurbs. */
  editorial_summary?: string;
  /** Human label for the primary type, e.g. "Coffee shop". */
  primary_type_display?: string;
  /** One real, quality-filtered Google review snippet — surfaced as
   *  an ATTRIBUTED "what people say" line when there is no editorial
   *  summary. Never presented as our own copy. */
  review_snippet?: string;
  review_author?: string;
  review_author_uri?: string;
  review_author_photo_uri?: string;
  review_google_maps_uri?: string;
  review_flag_content_uri?: string;
  /** Canonical Google Maps source for the place record. */
  google_maps_uri?: string;
  /** Request-scoped Google context. These fields are rendered with Google
   * attribution and are never persisted into Radius-authored descriptions. */
  generative_summary?: GooglePlaceSummary;
  decision_features?: GooglePlaceFeature[];
};

/**
 * A maintenance caller must be able to tell a trustworthy empty result from
 * an upstream failure. Public request paths keep their existing null fallback,
 * while paid batch jobs use this result to avoid recording outages as a
 * durable no-match.
 */
export type GooglePlaceLookupResult =
  | { status: "found"; data: PlaceEnrichment }
  | { status: "no_match" }
  | { status: "provider_error"; reason: string };

export type GooglePlaceSummary = {
  text: string;
  disclosure: string;
  report_uri?: string;
};

export type GooglePlaceFeature =
  | "allows_dogs"
  | "curbside_pickup"
  | "delivery"
  | "dine_in"
  | "good_for_children"
  | "good_for_groups"
  | "good_for_watching_sports"
  | "live_music"
  | "outdoor_seating"
  | "reservable"
  | "restroom"
  | "serves_breakfast"
  | "serves_brunch"
  | "serves_coffee"
  | "serves_vegetarian_food"
  | "takeout";

export type GoogleAuthorAttribution = {
  display_name?: string;
  uri?: string;
  photo_uri?: string;
};

export type GooglePhotoAttribution = {
  photo_name: string;
  google_maps_uri?: string;
  flag_content_uri?: string;
  authors: GoogleAuthorAttribution[];
};

function key(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY || null;
}

export function googlePlacesConfigured(): boolean {
  return Boolean(key());
}

/**
 * Field sets, chosen to control the Places API (New) billing SKU:
 *   - "full"   → includes `reviews` ⇒ Enterprise + Atmosphere (priciest).
 *                Use ONLY at build time, where we actually store reviews.
 *   - "basic"  → visit logistics + photos, with no summaries or reviews.
 *                This is the only field set an automatic, gap-filling place
 *                sheet request may use.
 *   - "lean"   → everything except reviews ⇒ Enterprise tier. Kept for
 *                explicit callers that need editorial context.
 *   - "status" → id + businessStatus only ⇒ cheapest tier. For the
 *                business-status cron, which reads nothing else.
 */
export type GoogleFieldSet =
  | "status"
  | "hours"
  | "basic"
  | "lean"
  | "full"
  | "photos"
  | "photo-resolve"
  | "experience";

const FIELDS_FULL = [
  "id", "displayName", "formattedAddress", "businessStatus", "primaryType",
  "currentOpeningHours.weekdayDescriptions", "regularOpeningHours.weekdayDescriptions",
  "rating", "userRatingCount", "nationalPhoneNumber", "websiteUri", "location",
  "photos", "editorialSummary", "primaryTypeDisplayName", "reviews", "googleMapsUri",
];
const FIELDS_LEAN = FIELDS_FULL.filter((f) => f !== "reviews");
const FIELDS_STATUS = ["id", "businessStatus"];
// The rolling hours refresh (data brief 4.3): hours plus status, nothing
// else, so the per call cost stays on the cheapest applicable SKU.
const FIELDS_HOURS = [
  "id", "businessStatus",
  "currentOpeningHours.weekdayDescriptions", "regularOpeningHours.weekdayDescriptions",
];
// Runtime gap-filling for a genuinely bare place sheet. It deliberately
// excludes editorialSummary, generativeSummary, reviews, and decision
// attributes. Those richer fields are requested only after a user asks for
// current Google context.
const FIELDS_BASIC = [
  "id", "displayName", "businessStatus",
  "currentOpeningHours.weekdayDescriptions", "regularOpeningHours.weekdayDescriptions",
  "rating", "userRatingCount", "nationalPhoneNumber", "websiteUri",
  "location", "photos", "googleMapsUri",
];

// Photo self-heal (place-photo proxy): photo resource names only, so the
// per-call cost of refreshing a rotated name stays on the smallest SKU
// that carries photos.
const FIELDS_PHOTOS = ["id", "photos"];
// Identity-safe photo discovery for a public listing that does not yet have a
// durable Google Place ID. Text Search needs the returned name and point so
// resolveAndEnrich can reject a wrong nearby business before we publish its
// image. Keep the mask narrower than "basic": this pass does not need hours,
// ratings, phone, or website data.
const FIELDS_PHOTO_RESOLVE = [
  "id",
  "displayName",
  "formattedAddress",
  "businessStatus",
  "location",
  "photos",
  "googleMapsUri",
];
// User-opened place context. FIELDS_LEAN already reaches the Enterprise +
// Atmosphere SKU because it requests editorialSummary; these additional
// decision fields make that paid request materially more useful without
// moving it to a higher Places Details tier.
const FIELDS_EXPERIENCE = [
  ...FIELDS_LEAN,
  "generativeSummary", "reviews",
  "allowsDogs", "curbsidePickup", "delivery", "dineIn",
  "goodForChildren", "goodForGroups", "goodForWatchingSports", "liveMusic",
  "outdoorSeating", "reservable", "restroom", "servesBreakfast",
  "servesBrunch", "servesCoffee", "servesVegetarianFood", "takeout",
];

function fieldsFor(set: GoogleFieldSet): string[] {
  return set === "status" ? FIELDS_STATUS
    : set === "hours" ? FIELDS_HOURS
    : set === "basic" ? FIELDS_BASIC
    : set === "full" ? FIELDS_FULL
    : set === "photos" ? FIELDS_PHOTOS
    : set === "photo-resolve" ? FIELDS_PHOTO_RESOLVE
    : set === "experience" ? FIELDS_EXPERIENCE
    : FIELDS_LEAN;
}

type GApiPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  businessStatus?: string;
  primaryType?: string;
  currentOpeningHours?: { weekdayDescriptions?: string[] };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  generativeSummary?: {
    overview?: { text?: string };
    flagContentUri?: string;
    overviewFlagContentUri?: string;
    disclosureText?: { text?: string };
    disclaimerText?: { text?: string };
  };
  allowsDogs?: boolean;
  curbsidePickup?: boolean;
  delivery?: boolean;
  dineIn?: boolean;
  goodForChildren?: boolean;
  goodForGroups?: boolean;
  goodForWatchingSports?: boolean;
  liveMusic?: boolean;
  outdoorSeating?: boolean;
  reservable?: boolean;
  restroom?: boolean;
  servesBreakfast?: boolean;
  servesBrunch?: boolean;
  servesCoffee?: boolean;
  servesVegetarianFood?: boolean;
  takeout?: boolean;
  location?: { latitude?: number; longitude?: number };
  photos?: Array<{
    name?: string;
    googleMapsUri?: string;
    flagContentUri?: string;
    authorAttributions?: Array<{
      displayName?: string;
      uri?: string;
      photoUri?: string;
    }>;
  }>;
  editorialSummary?: { text?: string };
  primaryTypeDisplayName?: { text?: string };
  reviews?: Array<{
    text?: { text?: string };
    rating?: number;
    googleMapsUri?: string;
    flagContentUri?: string;
    authorAttribution?: {
      displayName?: string;
      uri?: string;
      photoUri?: string;
    };
  }>;
};

const FEATURE_FIELDS: Array<[keyof GApiPlace, GooglePlaceFeature]> = [
  ["allowsDogs", "allows_dogs"],
  ["curbsidePickup", "curbside_pickup"],
  ["delivery", "delivery"],
  ["dineIn", "dine_in"],
  ["goodForChildren", "good_for_children"],
  ["goodForGroups", "good_for_groups"],
  ["goodForWatchingSports", "good_for_watching_sports"],
  ["liveMusic", "live_music"],
  ["outdoorSeating", "outdoor_seating"],
  ["reservable", "reservable"],
  ["restroom", "restroom"],
  ["servesBreakfast", "serves_breakfast"],
  ["servesBrunch", "serves_brunch"],
  ["servesCoffee", "serves_coffee"],
  ["servesVegetarianFood", "serves_vegetarian_food"],
  ["takeout", "takeout"],
];

export function decisionFeatures(place: GApiPlace): GooglePlaceFeature[] {
  return FEATURE_FIELDS.flatMap(([field, feature]) =>
    place[field] === true ? [feature] : [],
  );
}

export function normalizeGooglePlaceSummary(
  summary: GApiPlace["generativeSummary"],
): GooglePlaceSummary | undefined {
  const text = summary?.overview?.text?.trim();
  const disclosure = (
    summary?.disclosureText?.text ?? summary?.disclaimerText?.text
  )?.trim();
  return text && disclosure
    ? {
        text,
        disclosure,
        report_uri: summary?.flagContentUri ?? summary?.overviewFlagContentUri,
      }
    : undefined;
}

export function normalizeGooglePhotoAttributions(
  photos: GApiPlace["photos"],
): GooglePhotoAttribution[] {
  return (photos ?? []).flatMap((photo) => {
    if (!photo.name) return [];
    return [{
      photo_name: photo.name,
      google_maps_uri: photo.googleMapsUri,
      flag_content_uri: photo.flagContentUri,
      authors: (photo.authorAttributions ?? []).map((author) => ({
        display_name: author.displayName?.trim() || undefined,
        uri: author.uri || undefined,
        photo_uri: author.photoUri || undefined,
      })),
    } satisfies GooglePhotoAttribution];
  });
}

/**
 * Pick ONE usable review snippet: highest-rated first, then sane
 * length (a one-liner, not an essay), single line, trimmed. Returns
 * undefined when nothing clears the bar — never fabricates.
 */
export function pickReview(
  reviews: GApiPlace["reviews"],
): {
  snippet: string;
  author?: string;
  authorUri?: string;
  authorPhotoUri?: string;
  googleMapsUri?: string;
  flagContentUri?: string;
} | undefined {
  if (!Array.isArray(reviews) || reviews.length === 0) return undefined;
  // Logistics-y reviews ("clean bathroom", "easy parking", "they were
  // closed") make odd "human highlights" — skip them when a substantive
  // one exists (the library showing a bathroom quote, audit QA).
  const LOGISTICS = /\b(bathroom|restroom|toilet|parking|was closed|were closed|closed early|rude staff)\b/i;
  const candidates = reviews
    .map((r) => ({
      snippet: r.text?.text?.replace(/\s+/g, " ").trim() ?? "",
      rating: r.rating ?? 0,
      author: r.authorAttribution?.displayName?.trim() || undefined,
      authorUri: r.authorAttribution?.uri || undefined,
      authorPhotoUri: r.authorAttribution?.photoUri || undefined,
      googleMapsUri: r.googleMapsUri || undefined,
      flagContentUri: r.flagContentUri || undefined,
    }))
    .filter((c) => c.snippet.length >= 40 && c.snippet.length <= 240 && c.rating >= 4);
  if (candidates.length === 0) return undefined;
  const substantive = candidates.filter((c) => !LOGISTICS.test(c.snippet));
  const pool = substantive.length > 0 ? substantive : candidates;
  // Highest rating first, then prefer a descriptive length (~140 chars)
  // over a terse "Great!" or a rambling wall of text.
  pool.sort(
    (a, b) => b.rating - a.rating || Math.abs(a.snippet.length - 140) - Math.abs(b.snippet.length - 140),
  );
  return {
    snippet: pool[0].snippet,
    author: pool[0].author,
    authorUri: pool[0].authorUri,
    authorPhotoUri: pool[0].authorPhotoUri,
    googleMapsUri: pool[0].googleMapsUri,
    flagContentUri: pool[0].flagContentUri,
  };
}

function normalize(p: GApiPlace): PlaceEnrichment | null {
  if (!p.id) return null;
  const hours =
    p.currentOpeningHours?.weekdayDescriptions ??
    p.regularOpeningHours?.weekdayDescriptions ??
    [];
  const status = (p.businessStatus as GoogleBusinessStatus) || "UNKNOWN";
  const selectedReview = pickReview(p.reviews);
  const generativeSummary = normalizeGooglePlaceSummary(p.generativeSummary);
  const photoAttributions = normalizeGooglePhotoAttributions(p.photos);
  return {
    google_place_id: p.id,
    business_status: status,
    display_name: p.displayName?.text,
    formatted_address: p.formattedAddress,
    weekday_hours: hours,
    has_hours: hours.length > 0,
    rating: p.rating,
    user_rating_count: p.userRatingCount,
    photo_names: (p.photos ?? []).map((ph) => ph.name).filter(Boolean) as string[],
    photo_attributions: photoAttributions,
    phone: p.nationalPhoneNumber,
    website: p.websiteUri,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    primary_type: p.primaryType,
    editorial_summary: p.editorialSummary?.text,
    primary_type_display: p.primaryTypeDisplayName?.text,
    review_snippet: selectedReview?.snippet,
    review_author: selectedReview?.author,
    review_author_uri: selectedReview?.authorUri,
    review_author_photo_uri: selectedReview?.authorPhotoUri,
    review_google_maps_uri: selectedReview?.googleMapsUri,
    review_flag_content_uri: selectedReview?.flagContentUri,
    google_maps_uri: p.googleMapsUri,
    generative_summary: generativeSummary,
    decision_features: decisionFeatures(p),
  };
}

/** Fetch Place Details by a known place id ("ChIJ…" or "places/ChIJ…").
 *  `fields` controls the billing SKU — defaults to "lean" (no reviews). */
export async function getPlaceDetailsResult(
  placeId: string,
  fields: GoogleFieldSet = "lean",
): Promise<GooglePlaceLookupResult> {
  const k = key();
  if (!k) return { status: "provider_error", reason: "missing_api_key" };
  const id = placeId.startsWith("places/") ? placeId : `places/${placeId}`;
  try {
    const res = await fetch(`${BASE}/${id}`, {
      headers: {
        "X-Goog-Api-Key": k,
        "X-Goog-FieldMask": fieldsFor(fields).join(","),
      },
      // Places content is fetched for the current request only. Persisting
      // Google content belongs to a separate licensed-data decision; this
      // thin client does not put responses into Next's data cache.
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.error(`[google-places] details HTTP ${res.status} for ${id}`);
      return res.status === 404
        ? { status: "no_match" }
        : { status: "provider_error", reason: `http_${res.status}` };
    }
    const data = normalize((await res.json()) as GApiPlace);
    return data ? { status: "found", data } : { status: "no_match" };
  } catch (err) {
    console.error("[google-places] details failed:", err);
    return { status: "provider_error", reason: "request_failed" };
  }
}

/** Public/request-time compatibility wrapper: failures remain a null fallback. */
export async function getPlaceDetails(
  placeId: string,
  fields: GoogleFieldSet = "lean",
): Promise<PlaceEnrichment | null> {
  const result = await getPlaceDetailsResult(placeId, fields);
  return result.status === "found" ? result.data : null;
}

/**
 * Resolve a place id from a name + address (+ optional bias point) via
 * Text Search. Returns the first, best match's full enrichment in one call.
 */
/** Meters between two lat/lng. */
function metersBetween(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371000, dLa = ((la2 - la1) * Math.PI) / 180, dLo = ((lo2 - lo1) * Math.PI) / 180;
  const a = Math.sin(dLa / 2) ** 2 +
    Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/** Lenient name check — true unless the names clearly disagree. Distance is
 *  the strong gate; this catches same-building wrong-tenant matches. */
function namesPlausible(ours: string, theirs?: string): boolean {
  if (!theirs) return true;
  if (hasIdentitySubfacilityConflict(ours, theirs)) return false;
  const toks = (s: string) =>
    new Set(
      s.toLowerCase()
        .replace(/\b(the|llc|inc|co|company|of|frederick|md|maryland)\b/g, " ")
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  const A = toks(ours), B = toks(theirs);
  if (A.size === 0 || B.size === 0) return true; // can't judge → let distance decide
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const jaccard = inter / (A.size + B.size - inter);
  // Accept on decent overlap OR a shared distinctive (longer) token.
  return jaccard >= 0.34 || [...A].some((w) => B.has(w) && w.length >= 5);
}

/**
 * Resolve a place by name/address to its Google record AND verify the
 * match before trusting it. Without this gate, searchText's top hit (a
 * better-named business in another block/town) was applied wholesale —
 * the source of wrong photos/hours/ratings on cards. Confidence gate:
 * reject a candidate that's >250m from our known coords or whose name
 * clearly disagrees. Returns null rather than a wrong place (the
 * data-confidence rule: no photo beats the wrong photo).
 */
const MAX_MATCH_METERS = 250;

export async function resolveAndEnrichResult(opts: {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
}, fields: GoogleFieldSet = "lean"): Promise<GooglePlaceLookupResult> {
  const k = key();
  if (!k) return { status: "provider_error", reason: "missing_api_key" };
  const textQuery = [opts.name, opts.address].filter(Boolean).join(", ");
  try {
    // Pull a few candidates so we can take the first that PASSES the gate,
    // not blindly the top hit.
    const body: Record<string, unknown> = { textQuery, maxResultCount: 5 };
    if (opts.lat != null && opts.lng != null) {
      body.locationBias = {
        circle: {
          center: { latitude: opts.lat, longitude: opts.lng },
          radius: 500.0,
        },
      };
    }
    const res = await fetch(`${BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": k,
        "X-Goog-FieldMask": fieldsFor(fields).map((f) => `places.${f}`).join(","),
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.error(`[google-places] searchText HTTP ${res.status} for "${textQuery}"`);
      return { status: "provider_error", reason: `http_${res.status}` };
    }
    const data = (await res.json()) as { places?: GApiPlace[] };
    for (const cand of data.places ?? []) {
      const r = normalize(cand);
      if (!r) continue;
      // Distance gate (strong) — only when we know where the place is.
      if (opts.lat != null && opts.lng != null && r.lat != null && r.lng != null) {
        const d = metersBetween(opts.lat, opts.lng, r.lat, r.lng);
        if (d > MAX_MATCH_METERS) continue;
      }
      // Name gate (catches same-building wrong tenant).
      if (!namesPlausible(opts.name, r.display_name)) continue;
      return { status: "found", data: r }; // first candidate that passes
    }
    return { status: "no_match" }; // nothing trustworthy — no photo beats a wrong photo
  } catch (err) {
    console.error("[google-places] searchText failed:", err);
    return { status: "provider_error", reason: "request_failed" };
  }
}

/** Public/request-time compatibility wrapper: failures remain a null fallback. */
export async function resolveAndEnrich(opts: {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
}, fields: GoogleFieldSet = "lean"): Promise<PlaceEnrichment | null> {
  const result = await resolveAndEnrichResult(opts, fields);
  return result.status === "found" ? result.data : null;
}

/**
 * Build a usable photo URL from a photo resource name.
 * `maxWidthPx` keeps cost down and matches our card sizes.
 * NOTE: this URL embeds the API key, so only use it server-side or proxy it.
 */
export function photoUrl(photoName: string, maxWidthPx = 800): string | null {
  const k = key();
  if (!k) return null;
  return `${BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${k}`;
}
