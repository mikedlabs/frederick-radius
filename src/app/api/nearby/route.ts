import { NextResponse } from "next/server";
import { nearbyNow } from "@/lib/connect";

/**
 * GET /api/nearby?lng=&lat=&limit=&radiusM=
 *
 * Server-side join: given the user's position, return the typed
 * NearbyContext (resolved municipality, civic anchors, open places,
 * live + upcoming events nearest first). NearbyNow used to call
 * `nearbyNow()` directly on the client, which pulled
 * lib/connect → places-client.json (~2MB) into the /now route's
 * client bundle. This endpoint moves that join to the edge.
 *
 * Result is time-sensitive (open hours, live events), so caching is
 * short — s-maxage=60 with SWR=300 lets the edge collapse repeat
 * pings within a minute while staying fresh.
 *
 * Inputs are bounded so a malformed client can't blow up the index:
 *   - lng in [-180, 180], lat in [-90, 90]
 *   - limit clamped to [1, 24]
 *   - radiusM clamped to [500, 80_000] (half-mile to ~50mi)
 */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lng = Number(url.searchParams.get("lng"));
  const lat = Number(url.searchParams.get("lat"));

  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lng < -180 ||
    lng > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return NextResponse.json(
      { error: "lng and lat are required and must be finite coordinates" },
      { status: 400 },
    );
  }

  const limitRaw = Number(url.searchParams.get("limit") ?? 6);
  const limit = Number.isFinite(limitRaw) ? clamp(Math.floor(limitRaw), 1, 24) : 6;

  const radiusRaw = Number(url.searchParams.get("radiusM") ?? NaN);
  const radiusM = Number.isFinite(radiusRaw)
    ? clamp(Math.floor(radiusRaw), 500, 80_000)
    : undefined;

  const ctx = nearbyNow(
    { lng, lat },
    { now: new Date(), limit, ...(radiusM ? { radiusM } : {}) },
  );

  return NextResponse.json(ctx, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
