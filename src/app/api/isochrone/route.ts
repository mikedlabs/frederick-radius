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
 *   1. Keep the dedicated server token out of browser JavaScript. The route
 *      also sends MAPBOX_SERVER_HEADERS so a least-privilege token carrying a
 *      URL rule remains compatible.
 *   2. Edge-cache the polygon by (lng,lat,mode,minutes). Mapbox bills
 *      per request; walking and cycling polygons can live for a day,
 *      while traffic-aware driving polygons refresh every five minutes.
 *
 * If Mapbox 4xx/5xx or the token is misconfigured, the route returns
 * a structured `{ ok: false, reason }` 200 so the client can quietly
 * fall back to a circle. Map should never go blank because of this.
 */
import { isValidCoord } from "@/lib/geo";
import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import {
  MAPBOX_SERVER_HEADERS,
  MAPBOX_SERVER_TOKEN,
} from "@/lib/mapbox-server";
import {
  mapboxDailyUsageCap,
  mapboxRequestRuntimeEnabled,
} from "@/lib/mapbox-budget";
import { reserveDailyUsage } from "@/lib/usage-meter";
import { isOverPaidRequestBudget, isSameOriginRequest } from "@/lib/origin-check";
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

class MapboxIsochroneError extends Error {
  constructor(readonly status: number) {
    super(`Mapbox Isochrone HTTP ${status}`);
  }
}

class MapboxIsochroneUnavailableError extends Error {
  constructor(
    readonly reason:
      | "disabled"
      | "no-token"
      | "cost-control-unavailable"
      | "daily-cap-reached",
  ) {
    super(reason);
  }
}

async function fetchIsochroneUncached(
  profile: string,
  lng: number,
  lat: number,
  minutes: number,
): Promise<unknown> {
  // Cached polygons remain available with the breaker off. Only a true cache
  // miss needs a runtime gate, a server credential, and one atomic request.
  if (!mapboxRequestRuntimeEnabled("isochrone")) {
    throw new MapboxIsochroneUnavailableError("disabled");
  }
  if (!MAPBOX_SERVER_TOKEN) {
    throw new MapboxIsochroneUnavailableError("no-token");
  }
  const reservation = await reserveDailyUsage(
    "mapbox_isochrone",
    mapboxDailyUsageCap("isochrone_request"),
  );
  if (!reservation) {
    throw new MapboxIsochroneUnavailableError("cost-control-unavailable");
  }
  if (!reservation.reserved) {
    throw new MapboxIsochroneUnavailableError("daily-cap-reached");
  }

  const upstream =
    `https://api.mapbox.com/isochrone/v1/mapbox/${profile}/${lng},${lat}` +
    `?contours_minutes=${minutes}&polygons=true&denoise=1&access_token=${MAPBOX_SERVER_TOKEN}`;
  const response = await fetch(upstream, {
    headers: MAPBOX_SERVER_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new MapboxIsochroneError(response.status);
  return response.json();
}

const fetchDayIsochrone = unstable_cache(
  fetchIsochroneUncached,
  ["mapbox-isochrone-day-v2"],
  { revalidate: DAY_SECONDS },
);

const fetchTrafficIsochrone = unstable_cache(
  fetchIsochroneUncached,
  ["mapbox-isochrone-traffic-v2"],
  { revalidate: DRIVE_TRAFFIC_CACHE_SECONDS },
);

export async function GET(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return new Response("Forbidden", { status: 403 });
  }
  // Paid upstream — Isochrone is one of Mapbox's metered APIs.
  // 60/min/IP is comfortable: a normal user re-fetches a few times
  // as they fiddle with mode/minutes; a scraper would blow past it.
  if (await isOverPaidRequestBudget(req, "isochrone", 60, 60, 8)) {
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

  const cacheSeconds =
    mode === "drive" ? DRIVE_TRAFFIC_CACHE_SECONDS : DAY_SECONDS;
  const staleSeconds = mode === "drive" ? DRIVE_TRAFFIC_CACHE_SECONDS : 604_800;

  try {
    const data = await (mode === "drive"
      ? fetchTrafficIsochrone(profile, approximateLng, approximateLat, minutes)
      : fetchDayIsochrone(profile, approximateLng, approximateLat, minutes));
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
  } catch (error) {
    if (error instanceof MapboxIsochroneUnavailableError) {
      return Response.json({ ok: false, reason: error.reason });
    }
    if (error instanceof MapboxIsochroneError) {
      return Response.json({ ok: false, reason: `upstream-${error.status}` });
    }
    return Response.json({ ok: false, reason: "fetch-error" });
  }
}
