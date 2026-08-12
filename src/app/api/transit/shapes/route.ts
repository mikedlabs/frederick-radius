/**
 * Frederick County TransIT route geometry for on-demand map views.
 *
 * Pulse intentionally does not fetch or serialize this payload during its
 * initial render. The first map reveal calls this endpoint instead. The
 * committed official GTFS snapshot is canonical; Maryland Open Data is used
 * only if that snapshot has no drawable routes. These response headers let
 * the edge serve repeat map opens without another function run.
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

  return NextResponse.json(
    {
      shapes,
      source: shapes.source,
      sourceLabel: shapes.sourceLabel,
      generatedAt: shapes.generatedAt,
    },
    { headers: CACHE_HEADERS },
  );
}
