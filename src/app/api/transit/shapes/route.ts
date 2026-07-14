/**
 * Frederick County TransIT route geometry for on-demand map views.
 *
 * Pulse intentionally does not fetch or serialize this payload during its
 * initial render. The first map reveal calls this endpoint instead. The
 * integration's upstream request is cached for one week, and these response
 * headers let the edge serve repeat map opens without another function run.
 */
import { NextResponse } from "next/server";
import { getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=3600, s-maxage=604800, stale-while-revalidate=2592000",
};

export async function GET() {
  const shapes = await getFrederickTransitRouteShapes();

  if (shapes.features.length === 0) {
    return NextResponse.json(
      { error: "route-shapes-unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({ shapes }, { headers: CACHE_HEADERS });
}
