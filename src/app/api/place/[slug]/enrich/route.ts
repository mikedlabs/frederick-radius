/**
 * On-demand Google enrichment for the long-tail (DFP-scraped) places.
 *
 * The 51 curated places are enriched at build time into
 * places-enrichment.json. The ~1,280 DFP places are NOT — they have no
 * photos/hours/rating. This route fills that gap the first time anyone
 * actually opens a place, then caches the result in Next's data cache for
 * 7 days. Idle cost is $0; cost scales only with real usage.
 *
 *   GET /api/place/<slug>/enrich  →  { photos, hours, phone, website, ... }
 *
 * Returns 200 with {} when there's no match or no API key, so the client
 * can always treat a response as best-effort and degrade gracefully.
 */
import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { PLACE_BY_SLUG } from "@/data/places";
import {
  getPlaceDetails,
  resolveAndEnrich,
  type PlaceEnrichment,
} from "@/lib/integrations/google-places";

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
};

const EMPTY: EnrichResponse = { photos: [], hours: [] };

/** Cached per-slug for 7 days. The Google fetch inside is the billed call. */
const enrichSlug = unstable_cache(
  async (slug: string): Promise<EnrichResponse> => {
    const p = PLACE_BY_SLUG[slug];
    if (!p) return EMPTY;

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
    };
  },
  ["place-enrich-v1"],
  { revalidate: 604800, tags: ["place-enrich"] }
);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const data = await enrichSlug(slug);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json(EMPTY);
  }
}
