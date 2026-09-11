/**
 * Mapbox Static Images proxy — the locator <img> on place/event pages.
 *
 *   /api/static-map?lng=-77.41&lat=39.41&pin=e14328&w=640&h=352
 *
 * Proxied because it CANNOT be fetched any other way: the production
 * token is URL-restricted and Mapbox matches the Referer header on all
 * its APIs, so Vercel's next/image optimizer (which fetches with no
 * Referer) gets a 403 and serves a 502 broken image — exactly what
 * happened to the first VenueMiniMap. This route adds the Referer
 * server-side and keeps a bounded image in the application and CDN caches, so
 * one Mapbox render serves every visitor of a place for a month.
 */
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
import { CATEGORIES } from "@/data/categories";
import { isOverPaidRequestBudget, isSameOriginRequest } from "@/lib/origin-check";

export const runtime = "nodejs";
// A locator image of a fixed pin never changes; cache hard.
export const revalidate = 2592000;

// Same county clamp the isochrone proxy uses (matches
// FREDERICK_COUNTY_BBOX in src/lib/geo.ts; self-contained on purpose).
const BBOX = { south: 39.265, west: -77.7, north: 39.745, east: -77.15 };

// Fixed size + zoom allowlists keep the cache-key space tiny and stop
// the route being used as a general-purpose Mapbox renderer.
const SIZES = new Set(["640x352", "640x280", "320x150"]);
const ZOOMS = new Set(["14.6"]);
const MAX_STATIC_IMAGE_BYTES = 1_250_000;
const PIN_COLORS = new Set([
  "e14328",
  ...CATEGORIES.map((category) => category.color.slice(1).toLowerCase()),
]);

type CachedStaticMap = {
  contentType: string;
  bodyBase64: string;
};

type StaticMapUnavailableReason =
  | "disabled"
  | "no-token"
  | "cost-control-unavailable"
  | "daily-cap-reached";

class StaticMapUnavailableError extends Error {
  constructor(readonly reason: StaticMapUnavailableReason) {
    super(reason);
  }
}

class StaticMapUpstreamError extends Error {
  constructor(readonly status: number) {
    super(`Mapbox Static Images HTTP ${status}`);
  }
}

async function fetchStaticMapUncached(
  lng: string,
  lat: string,
  pin: string,
  size: string,
  zoom: string,
): Promise<CachedStaticMap> {
  // The breaker and token checks live inside the cache-miss function. Existing
  // cached locator art can still render while new paid work is held off.
  if (!mapboxRequestRuntimeEnabled("static")) {
    throw new StaticMapUnavailableError("disabled");
  }
  if (!MAPBOX_SERVER_TOKEN) {
    throw new StaticMapUnavailableError("no-token");
  }

  const reservation = await reserveDailyUsage(
    "mapbox_static",
    mapboxDailyUsageCap("static_request"),
  );
  if (!reservation) {
    throw new StaticMapUnavailableError("cost-control-unavailable");
  }
  if (!reservation.reserved) {
    throw new StaticMapUnavailableError("daily-cap-reached");
  }

  const upstream =
    `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/` +
    `pin-s+${pin}(${lng},${lat})/${lng},${lat},${zoom},0/${size}@2x` +
    `?access_token=${MAPBOX_SERVER_TOKEN}`;
  const response = await fetch(upstream, {
    headers: MAPBOX_SERVER_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new StaticMapUpstreamError(response.status);

  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_STATIC_IMAGE_BYTES
  ) {
    throw new StaticMapUpstreamError(502);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_STATIC_IMAGE_BYTES) {
    throw new StaticMapUpstreamError(502);
  }
  return {
    contentType: response.headers.get("content-type") ?? "image/png",
    // unstable_cache stores JSON-safe values. The 1.25 MB byte ceiling keeps
    // the base64 payload below the platform's 2 MB item ceiling.
    bodyBase64: Buffer.from(bytes).toString("base64"),
  };
}

const fetchStaticMap = unstable_cache(
  fetchStaticMapUncached,
  ["mapbox-static-locator-v2"],
  { revalidate: 2_592_000 },
);

export async function GET(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (await isOverPaidRequestBudget(req, "static-map", 120, 60, 15)) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  const sp = req.nextUrl.searchParams;
  const lng = parseFloat(sp.get("lng") || "");
  const lat = parseFloat(sp.get("lat") || "");
  const pin = (sp.get("pin") || "e14328").toLowerCase();
  const size = sp.get("size") || "640x352";
  const zoom = sp.get("zoom") || "14.6";

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return new Response("bad coords", { status: 400 });
  }
  if (lat < BBOX.south || lat > BBOX.north || lng < BBOX.west || lng > BBOX.east) {
    return new Response("out of county", { status: 400 });
  }
  if (!PIN_COLORS.has(pin) || !SIZES.has(size) || !ZOOMS.has(zoom)) {
    return new Response("bad params", { status: 400 });
  }
  // Eleven-meter precision is ample for a locator thumbnail and reduces the
  // paid CDN cache-key surface by two orders of magnitude.
  const lngs = lng.toFixed(4);
  const lats = lat.toFixed(4);

  try {
    const image = await fetchStaticMap(lngs, lats, pin, size, zoom);
    const body = Buffer.from(image.bodyBase64, "base64");
    const headers = new Headers({
      "Content-Type": image.contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control":
        "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=2592000",
    });
    return new Response(body, { headers });
  } catch (error) {
    if (error instanceof StaticMapUnavailableError) {
      return new Response("upstream unavailable", {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return new Response("upstream", { status: 502 });
  }
}
