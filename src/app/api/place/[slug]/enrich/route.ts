/**
 * On-demand Google enrichment for the long-tail (DFP-scraped) places.
 *
 * The 51 curated places are enriched at build time into
 * places-enrichment.json. The ~1,280 DFP places are NOT — they have no
 * photos/hours/rating. This route fills that gap the first time anyone
 * actually opens a place. The response is deliberately no-store: Google
 * Places content is request-scoped and is not retained in Next's data cache.
 *
 *   GET /api/place/<slug>/enrich  →  { photos, hours, phone, website, ... }
 *
 * Returns 200 with {} when there's no match or no API key, so the client
 * can always treat a response as best-effort and degrade gracefully.
 */
import { NextResponse } from "next/server";
import { PLACE_BY_SLUG } from "@/data/places";
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
import {
  getPlaceDetails,
  resolveAndEnrich,
  type PlaceEnrichment,
  type GooglePhotoAttribution,
} from "@/lib/integrations/google-places";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";

// Wrong-business quarantine (UX audit P0): these slugs were bound to a
// DIFFERENT business's Google listing, and the base record's stored
// google_place_id points at that wrong business — so this on-demand path
// would re-serve the law office's hours to the restaurant's sheet. Serve
// EMPTY until the slug is re-enriched with the correct listing.
const QUARANTINED = new Set(
  Object.entries(
    (OVERRIDES_RAW as { patch?: Record<string, { clearEnrichment?: boolean }> }).patch ?? {},
  )
    .filter(([, p]) => p.clearEnrichment)
    .map(([slug]) => slug),
);

export const runtime = "nodejs";

const photoProxy = (name: string, w = 800) =>
  `/api/place-photo?name=${encodeURIComponent(name)}&w=${w}`;

type EnrichResponse = {
  photos: string[];
  hours: string[];
  phone?: string;
  website?: string;
  rating?: number;
  rating_count?: number;
  status?: PlaceEnrichment["business_status"];
  photo_attributions?: GooglePhotoAttribution[];
  google_maps_uri?: string;
};

const EMPTY: EnrichResponse = { photos: [], hours: [] };

async function enrichSlug(slug: string): Promise<EnrichResponse> {
  const p = PLACE_BY_SLUG[slug];
  if (!p || QUARANTINED.has(slug)) return EMPTY;

  const data =
    p.google_place_id && /^ChIJ/.test(p.google_place_id)
      ? await getPlaceDetails(p.google_place_id)
      : await resolveAndEnrich({
          name: p.name,
          address: `${p.address}, ${p.city}, MD`,
          lat: p.geom?.lat,
          lng: p.geom?.lng,
        });

  if (!data) return EMPTY;
  return {
    photos: (data.photo_names ?? []).slice(0, 8).map((n) => photoProxy(n, 800)),
    hours: data.weekday_hours ?? [],
    phone: data.phone,
    website: data.website,
    rating: data.rating,
    rating_count: data.user_rating_count,
    status: data.business_status,
    photo_attributions: data.photo_attributions,
    google_maps_uri: data.google_maps_uri,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isSameOriginRequest(req)) {
    return new Response("Forbidden", { status: 403 });
  }
  // A place sheet should make at most one enrichment request. Keep the paid
  // Google path deliberately tighter than image/map browsing.
  if (await isRateLimited(req, "place-enrich", 30, 60)) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60", "Cache-Control": "private, no-store" },
    });
  }
  const { slug } = await params;
  try {
    const data = await enrichSlug(slug);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json(EMPTY, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
}
