/**
 * Public art overlay endpoint (data brief 6.3 pipeline, 6.5 layer).
 *
 * Serves the public-art layer as GeoJSON for lazy load on map toggle.
 * This is the static-GeoJSON shape the overlay pipeline standardizes on:
 * a small FeatureCollection with a long cache and an ETag so the edge
 * and the browser both revalidate cheaply, and a toggle never blocks
 * first paint. The layer is committed data (not a runtime ArcGIS call,
 * per 6.3), so the response is deterministic and safe to cache hard.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { publicArtGeoJSON } from "@/lib/loaders/publicArt";

export const runtime = "nodejs";
export const revalidate = 86400;

export function GET(request: Request) {
  const body = JSON.stringify(publicArtGeoJSON());
  const etag = `"${createHash("sha1").update(body).digest("hex")}"`;

  // Revalidate cheaply: an unchanged layer answers 304 with no body.
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/geo+json; charset=utf-8",
      ETag: etag,
      // Long edge cache with a day of stale-while-revalidate: the layer
      // changes only when the committed data does, which redeploys and
      // busts the cache anyway.
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
