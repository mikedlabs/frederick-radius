/**
 * Mapbox Isochrone API proxy — the "real reachable radius" engine.
 *
 *   /api/isochrone?lng=-77.41&lat=39.41&mode=walk&minutes=15
 *
 * Returns a GeoJSON FeatureCollection containing one Polygon (or
 * MultiPolygon) describing every point you can actually reach from
 * (lng,lat) within `minutes`, on real streets, by the chosen mode.
 * This is what makes /radius answer "what's within a 10-minute walk?"
 * honestly — straight-line distance can't, because Frederick has
 * creeks, hills, one-ways, and railroad tracks.
 *
 * Proxied for two reasons:
 *   1. Keep the Mapbox token's URL restrictions intact. The token is
 *      domain-locked to frederickradius.app, so client-side fetches
 *      from a different origin (preview deploys, scrapers) would 401.
 *      Server-to-server the restriction STILL applies (Mapbox matches
 *      the Referer header), so this route must send
 *      MAPBOX_SERVER_HEADERS — without it every upstream call 403s and
 *      the client silently falls back to a circle.
 *   2. Edge-cache the polygon by (lng,lat,mode,minutes). Mapbox bills
 *      per request; a 5-minute walk from Carroll Creek is the same
 *      polygon for everyone, so we let one server fetch serve everyone.
 *
 * If Mapbox 4xx/5xx or the token is misconfigured, the route returns
 * a structured `{ ok: false, reason }` 200 so the client can quietly
 * fall back to a circle. Map should never go blank because of this.
 */
import { meterUsage } from "@/lib/usage-meter";
import { NextRequest } from "next/server";
import { MAPBOX_TOKEN, MAPBOX_SERVER_HEADERS } from "@/lib/mapbox";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";
import { roundCoord } from "@/lib/walkTime";

export const runtime = "nodejs";
// Cache each polygon for a day. Walking routes don't change minute
// to minute and Mapbox bills per call.
export const revalidate = 86400;

const PROFILES: Record<string, string> = {
  walk: "walking",
  bike: "cycling",
  drive: "driving",
};

// County-sized clamp — server-side validation that the request is for
// a point inside Frederick County. Anything else is almost certainly
// not a legitimate request from our app. Matches FREDERICK_COUNTY_BBOX
// in src/lib/geo.ts; duplicated here so the route stays self-contained.
const BBOX = { south: 39.265, west: -77.700, north: 39.745, east: -77.150 };

// Mapbox supports up to 60 minutes per contour. We snap requests to
// our supported quick-pick durations so the cache key has only a few
// distinct values per (lng,lat,mode) — better hit rate.
const ALLOWED_MINUTES = new Set([5, 10, 15, 20, 25, 30, 45, 60]);

export async function GET(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return new Response("Forbidden", { status: 403 });
  }
  // Paid upstream — Isochrone is one of Mapbox's metered APIs.
  // 60/min/IP is comfortable: a normal user re-fetches a few times
  // as they fiddle with mode/minutes; a scraper would blow past it.
  if (await isRateLimited(req, "isochrone", 60, 60)) {
    return new Response("Too Many Requests", { status: 429 });
  }

  const sp = req.nextUrl.searchParams;
  const lng = parseFloat(sp.get("lng") || "");
  const lat = parseFloat(sp.get("lat") || "");
  const mode = sp.get("mode") || "walk";
  const minutes = parseInt(sp.get("minutes") || "", 10);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return Response.json({ ok: false, reason: "bad-coords" }, { status: 400 });
  }
  if (lat < BBOX.south || lat > BBOX.north || lng < BBOX.west || lng > BBOX.east) {
    return Response.json({ ok: false, reason: "out-of-bbox" }, { status: 400 });
  }
  const profile = PROFILES[mode];
  if (!profile) {
    return Response.json({ ok: false, reason: "bad-mode" }, { status: 400 });
  }
  if (!ALLOWED_MINUTES.has(minutes)) {
    return Response.json({ ok: false, reason: "bad-minutes" }, { status: 400 });
  }
  if (!MAPBOX_TOKEN) {
    // No token = degrade silently; client falls back to circle.
    return Response.json({ ok: false, reason: "no-token" });
  }

  // Snap to the same ~100m grid as the browser. This prevents an exact device
  // fix from reaching Mapbox or being reflected in our public response/cache.
  const approximateLng = roundCoord(lng);
  const approximateLat = roundCoord(lat);
  if (lng !== approximateLng || lat !== approximateLat) {
    const canonical = req.nextUrl.clone();
    canonical.searchParams.set("lng", String(approximateLng));
    canonical.searchParams.set("lat", String(approximateLat));
    return new Response(null, {
      status: 307,
      headers: {
        Location: canonical.toString(),
        "Cache-Control": "private, no-store",
      },
    });
  }

  // Build the Mapbox URL. `polygons=true` returns one filled polygon
  // (rather than line contours). `denoise=1` reduces tiny islands of
  // unreachable area — cleaner rendering at our zoom levels.
  const upstream = `https://api.mapbox.com/isochrone/v1/mapbox/${profile}/${approximateLng},${approximateLat}` +
    `?contours_minutes=${minutes}&polygons=true&denoise=1&access_token=${MAPBOX_TOKEN}`;

  try {
    meterUsage("mapbox_isochrone");
    const r = await fetch(upstream, {
      headers: MAPBOX_SERVER_HEADERS,
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(6_000),
    });
    if (!r.ok) {
      return Response.json({ ok: false, reason: `upstream-${r.status}` });
    }
    const data = await r.json();
    // Mapbox returns a FeatureCollection; pass through with a small
    // wrapper so the client knows it's a real success vs a fallback.
    return Response.json(
      {
        ok: true,
        geojson: data,
        mode,
        minutes,
        origin: { lng: approximateLng, lat: approximateLat },
      },
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
