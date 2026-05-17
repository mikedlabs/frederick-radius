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
};

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
    const body: Record<string, unknown> = { textQuery, maxResultCount: 1 };
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
    const first = data.places?.[0];
    return first ? normalize(first) : null;
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
