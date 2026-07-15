import { NextResponse } from "next/server";
import { nearbyNow } from "@/lib/connect";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";
import { roundCoord } from "@/lib/walkTime";

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
  if (!isSameOriginRequest(request)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (await isRateLimited(request, "nearby", 120, 60)) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

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

  // Legitimate clients already snap before sending. Re-round here so a
  // handcrafted request cannot make an exact location part of the response
  // or explode the public edge-cache key space.
  const approximateOrigin = { lng: roundCoord(lng), lat: roundCoord(lat) };
  if (lng !== approximateOrigin.lng || lat !== approximateOrigin.lat) {
    const canonical = new URL(request.url);
    canonical.searchParams.set("lng", String(approximateOrigin.lng));
    canonical.searchParams.set("lat", String(approximateOrigin.lat));
    return NextResponse.redirect(canonical, {
      status: 307,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const ctx = nearbyNow(
    approximateOrigin,
    { now: new Date(), limit, ...(radiusM ? { radiusM } : {}) },
  );

  return NextResponse.json(ctx, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
