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
 * Caching: callers persist results to the `place_enrichment` table with a
 * `fetched_at` timestamp and only re-fetch past the TTL. This module itself
 * does NOT cache — it's a thin client. The backfill script + loaders own TTL.
 */

import type { OperationalStatus } from "@/data/places";

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
};

function key(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY || null;
}

export function googlePlacesConfigured(): boolean {
  return Boolean(key());
}

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "businessStatus",
  "primaryType",
  "currentOpeningHours.weekdayDescriptions",
  "regularOpeningHours.weekdayDescriptions",
  "rating",
  "userRatingCount",
  "nationalPhoneNumber",
  "websiteUri",
  "location",
  "photos",
  "editorialSummary",
  "primaryTypeDisplayName",
  "reviews",
].join(",");

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
  location?: { latitude?: number; longitude?: number };
  photos?: Array<{ name?: string }>;
  editorialSummary?: { text?: string };
  primaryTypeDisplayName?: { text?: string };
  reviews?: Array<{
    text?: { text?: string };
    rating?: number;
    authorAttribution?: { displayName?: string };
  }>;
};

/**
 * Pick ONE usable review snippet: highest-rated first, then sane
 * length (a one-liner, not an essay), single line, trimmed. Returns
 * undefined when nothing clears the bar — never fabricates.
 */
function pickReview(
  reviews: GApiPlace["reviews"],
): { snippet: string; author?: string } | undefined {
  if (!Array.isArray(reviews) || reviews.length === 0) return undefined;
  const ranked = [...reviews].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  for (const r of ranked) {
    const raw = r.text?.text?.replace(/\s+/g, " ").trim() ?? "";
    if (raw.length < 40 || raw.length > 240) continue;
    if ((r.rating ?? 0) < 4) continue; // lead with positive, honest signal
    return {
      snippet: raw,
      author: r.authorAttribution?.displayName?.trim() || undefined,
    };
  }
  return undefined;
}

function normalize(p: GApiPlace): PlaceEnrichment | null {
  if (!p.id) return null;
  const hours =
    p.currentOpeningHours?.weekdayDescriptions ??
    p.regularOpeningHours?.weekdayDescriptions ??
    [];
  const status = (p.businessStatus as GoogleBusinessStatus) || "UNKNOWN";
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
    phone: p.nationalPhoneNumber,
    website: p.websiteUri,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    primary_type: p.primaryType,
    editorial_summary: p.editorialSummary?.text,
    primary_type_display: p.primaryTypeDisplayName?.text,
    review_snippet: pickReview(p.reviews)?.snippet,
    review_author: pickReview(p.reviews)?.author,
  };
}

/** Fetch Place Details by a known place id ("ChIJ…" or "places/ChIJ…"). */
export async function getPlaceDetails(placeId: string): Promise<PlaceEnrichment | null> {
  const k = key();
  if (!k) return null;
  const id = placeId.startsWith("places/") ? placeId : `places/${placeId}`;
  try {
    const res = await fetch(`${BASE}/${id}`, {
      headers: {
        "X-Goog-Api-Key": k,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
      // 24h ISR-friendly; real TTL is owned by the enrichment table.
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
       
      console.error(`[google-places] details HTTP ${res.status} for ${id}`);
      return null;
    }
    return normalize((await res.json()) as GApiPlace);
  } catch (err) {
     
    console.error("[google-places] details failed:", err);
    return null;
  }
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

export async function resolveAndEnrich(opts: {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
}): Promise<PlaceEnrichment | null> {
  const k = key();
  if (!k) return null;
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
        "X-Goog-FieldMask": `places.${DETAILS_FIELD_MASK.split(",").join(",places.")}`,
      },
      body: JSON.stringify(body),
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
       
      console.error(`[google-places] searchText HTTP ${res.status} for "${textQuery}"`);
      return null;
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
      return r; // first candidate that passes
    }
    return null; // nothing trustworthy — no photo beats a wrong photo
  } catch (err) {

    console.error("[google-places] searchText failed:", err);
    return null;
  }
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
