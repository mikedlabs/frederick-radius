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
 * server-side and streams the PNG back with a long CDN cache, so one
 * Mapbox render serves every visitor of a place for a month.
 */
import { meterUsage } from "@/lib/usage-meter";
import { NextRequest } from "next/server";
import { MAPBOX_TOKEN, MAPBOX_SERVER_HEADERS } from "@/lib/mapbox";

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

export async function GET(req: NextRequest) {
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
  if (!/^[0-9a-f]{6}$/.test(pin) || !SIZES.has(size) || !ZOOMS.has(zoom)) {
    return new Response("bad params", { status: 400 });
  }

  const lngs = lng.toFixed(5);
  const lats = lat.toFixed(5);
  const upstream =
    `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/` +
    `pin-s+${pin}(${lngs},${lats})/${lngs},${lats},${zoom},0/${size}@2x` +
    `?access_token=${MAPBOX_TOKEN}`;

  try {
    meterUsage("mapbox_static");
    const r = await fetch(upstream, {
      headers: MAPBOX_SERVER_HEADERS,
      next: { revalidate: 2592000 },
    });
    if (!r.ok) return new Response("upstream", { status: 502 });
    const body = await r.arrayBuffer();
    return new Response(body, {
      headers: {
        "Content-Type": r.headers.get("content-type") ?? "image/png",
        "Cache-Control":
          "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=2592000",
      },
    });
  } catch {
    return new Response("upstream", { status: 502 });
  }
}
