/**
 * Mapbox Directions proxy — real walking minutes between two points.
 *
 *   /api/walk-time?olng=-77.41&olat=39.414&dlng=-77.407&dlat=39.416
 *
 * Returns `{ ok: true, minutes, meters }` — the routed walking time on
 * real streets from the (o)rigin to the (d)estination. Add `geometry=1`
 * to also receive a compact GeoJSON-compatible `coordinates` array when
 * Mapbox provides a LineString. Existing callers keep the small legacy
 * response and the upstream request still uses `overview=false`.
 *
 * Proxied for the same two reasons as /api/isochrone:
 *   1. The Mapbox token's URL restrictions stay intact (domain-locked
 *      to frederickradius.app). Server-to-server the restriction STILL
 *      applies — Mapbox matches the Referer header — so the upstream
 *      fetch must send MAPBOX_SERVER_HEADERS.
 *   2. Edge-cache by URL. The client rounds the origin to 3 decimals
 *      (~100m — see src/lib/walkTime.ts) before building the URL, so
 *      nearby users share one cache entry AND no precise user location
 *      ever appears in a URL, cache key, or log. The route re-rounds
 *      defensively before calling upstream.
 *
 * Fail-soft contract: no token, out-of-county coords via a forged URL,
 * or an upstream error all yield `{ ok: false, reason }` (200 unless
 * the request itself is malformed) — the client quietly keeps its
 * straight-line estimate. The chip must never break because of this.
 */
import { NextRequest } from "next/server";
import { MAPBOX_TOKEN, MAPBOX_SERVER_HEADERS } from "@/lib/mapbox";
import { isValidCoord } from "@/lib/geo";
import {
  normalizeWalkRouteCoordinates,
  roundCoord,
  type WalkTimeSuccess,
} from "@/lib/walkTime";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";

export const runtime = "nodejs";
// Cache each routed leg for a day. The street network doesn't change
// minute to minute and Mapbox bills per call.
export const revalidate = 86400;

export async function GET(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return new Response("Forbidden", { status: 403 });
  }
  // Paid upstream — Directions is one of Mapbox's metered APIs. One
  // fetch per place selection within walking range; 60/min/IP is far
  // more than a person tapping pins, and a scraper blows past it.
  if (await isRateLimited(req, "walk-time", 60, 60)) {
    return new Response("Too Many Requests", { status: 429 });
  }

  const sp = req.nextUrl.searchParams;
  const olng = parseFloat(sp.get("olng") || "");
  const olat = parseFloat(sp.get("olat") || "");
  const dlng = parseFloat(sp.get("dlng") || "");
  const dlat = parseFloat(sp.get("dlat") || "");
  const includeGeometry = sp.get("geometry") === "1";

  if (![olng, olat, dlng, dlat].every(Number.isFinite)) {
    return Response.json({ ok: false, reason: "bad-coords" }, { status: 400 });
  }
  // Both endpoints must live in Frederick County (real outline plus the
  // 1.5km straddle buffer, not just the bbox). Anything else is not a
  // legitimate request from our app.
  if (
    !isValidCoord({ lng: olng, lat: olat }) ||
    !isValidCoord({ lng: dlng, lat: dlat })
  ) {
    return Response.json({ ok: false, reason: "out-of-county" }, { status: 400 });
  }
  if (!MAPBOX_TOKEN) {
    // No token = degrade silently; the client keeps its estimate.
    return Response.json({ ok: false, reason: "no-token" });
  }

  // Snap the origin to the ~100m grid so the upstream fetch cache
  // (keyed by URL) collapses nearby requests too, even if a caller
  // skipped the client-side rounding.
  const o = `${roundCoord(olng)},${roundCoord(olat)}`;
  const routeShape = includeGeometry
    ? "overview=simplified&geometries=geojson"
    : "overview=false";
  const upstream =
    `https://api.mapbox.com/directions/v5/mapbox/walking/${o};${dlng},${dlat}` +
    `?${routeShape}&access_token=${MAPBOX_TOKEN}`;

  try {
    // MAPBOX_SERVER_HEADERS is load-bearing: the URL-restricted token
    // 403s any server fetch that doesn't present the app's Referer.
    const r = await fetch(upstream, {
      headers: MAPBOX_SERVER_HEADERS,
      next: { revalidate: 86400 },
    });
    if (!r.ok) {
      return Response.json({ ok: false, reason: `upstream-${r.status}` });
    }
    const data = (await r.json()) as {
      code?: string;
      routes?: Array<{
        duration?: number;
        distance?: number;
        geometry?: { type?: string; coordinates?: unknown };
      }>;
    };
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route || !Number.isFinite(route.duration)) {
      return Response.json({ ok: false, reason: "no-route" });
    }
    const coordinates =
      includeGeometry && route.geometry?.type === "LineString"
        ? normalizeWalkRouteCoordinates(route.geometry.coordinates)
        : undefined;
    const response: WalkTimeSuccess = {
      ok: true,
      minutes: Math.max(1, Math.round((route.duration as number) / 60)),
      meters: Number.isFinite(route.distance)
        ? Math.round(route.distance as number)
        : null,
      ...(coordinates ? { coordinates } : {}),
    };
    return Response.json(
      response,
      {
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    return Response.json({ ok: false, reason: "fetch-error" });
  }
}
