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
 *      per request; walking and cycling polygons can live for a day,
 *      while traffic-aware driving polygons refresh every five minutes.
 *
 * If Mapbox 4xx/5xx or the token is misconfigured, the route returns
 * a structured `{ ok: false, reason }` 200 so the client can quietly
 * fall back to a circle. Map should never go blank because of this.
 */
import { meterUsage } from "@/lib/usage-meter";
import { isValidCoord } from "@/lib/geo";
import { NextRequest } from "next/server";
import {
  MAPBOX_SERVER_HEADERS,
  MAPBOX_SERVER_TOKEN,
} from "@/lib/mapbox-server";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";
import { roundCoord } from "@/lib/walkTime";

export const runtime = "nodejs";

const PROFILES: Record<string, string> = {
  walk: "walking",
  bike: "cycling",
  drive: "driving-traffic",
};

const DAY_SECONDS = 86_400;
const DRIVE_TRAFFIC_CACHE_SECONDS = 300;

// Mapbox accepts every whole-minute contour from 1 through 60. The
// fine-tune slider emits whole minutes, so rejecting non-preset values
// would silently turn most slider choices into circle fallbacks.
const MIN_MINUTES = 1;
const MAX_MINUTES = 60;

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
  const minutesParam = sp.get("minutes");
  const minutes = minutesParam === null ? Number.NaN : Number(minutesParam);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return Response.json({ ok: false, reason: "bad-coords" }, { status: 400 });
  }
  if (!isValidCoord({ lng, lat })) {
    return Response.json({ ok: false, reason: "out-of-county" }, { status: 400 });
  }
  const profile = PROFILES[mode];
  if (!profile) {
    return Response.json({ ok: false, reason: "bad-mode" }, { status: 400 });
  }
  if (
    !Number.isInteger(minutes) ||
    minutes < MIN_MINUTES ||
    minutes > MAX_MINUTES
  ) {
    return Response.json({ ok: false, reason: "bad-minutes" }, { status: 400 });
  }
  if (!MAPBOX_SERVER_TOKEN) {
    // No token = degrade silently; client falls back to circle.
    return Response.json({ ok: false, reason: "no-token" });
  }

  // Snap to the same ~100m grid as the browser. This prevents an exact device
  // fix from reaching Mapbox or being reflected in our public response/cache.
  const approximateLng = roundCoord(lng);
  const approximateLat = roundCoord(lat);
  if (!isValidCoord({ lng: approximateLng, lat: approximateLat })) {
    return Response.json(
      { ok: false, reason: "out-of-county" },
      { status: 400 },
    );
  }
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
    `?contours_minutes=${minutes}&polygons=true&denoise=1&access_token=${MAPBOX_SERVER_TOKEN}`;
  const cacheSeconds =
    mode === "drive" ? DRIVE_TRAFFIC_CACHE_SECONDS : DAY_SECONDS;
  const staleSeconds = mode === "drive" ? DRIVE_TRAFFIC_CACHE_SECONDS : 604_800;

  try {
    meterUsage("mapbox_isochrone");
    const r = await fetch(upstream, {
      headers: MAPBOX_SERVER_HEADERS,
      next: { revalidate: cacheSeconds },
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
          "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=${staleSeconds}`,
        },
      },
    );
  } catch {
    return Response.json({ ok: false, reason: "fetch-error" });
  }
}
