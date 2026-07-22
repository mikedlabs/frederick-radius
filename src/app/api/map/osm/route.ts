import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { fetchOsmFrederick } from "@/lib/integrations/overpass";

export const runtime = "nodejs";
export const revalidate = 86_400;

/**
 * Same-origin door to the optional OpenStreetMap amenity enrichment.
 *
 * The browser used to POST directly to volunteer Overpass servers. That was
 * blocked by our own Content Security Policy and made every fallback attempt
 * appear as a console error. Fetching here keeps the browser inside the site's
 * security boundary, gives the county-wide response a shared daily cache, and
 * preserves the integration's fail-soft empty-array behavior.
 */
const cachedOsmFrederick = unstable_cache(
  fetchOsmFrederick,
  ["map-osm-frederick-v1"],
  { revalidate: 86_400 },
);

export async function GET() {
  const places = await cachedOsmFrederick();
  return NextResponse.json(places, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
