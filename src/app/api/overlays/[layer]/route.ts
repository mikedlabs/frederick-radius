/**
 * Static overlay endpoint (data brief 6.3 pipeline).
 *
 * Serves the committed, simplified GeoJSON overlays pulled from the
 * county GIS (public/overlays/<layer>.geojson) for lazy load on map
 * toggle. Each layer is small (well under 1 MB gzipped), so it ships as
 * static GeoJSON with a long cache and an ETag: the edge and the browser
 * revalidate cheaply, an untouched layer costs nothing, and the map
 * never calls an ArcGIS endpoint at runtime (the pull is a build/commit
 * step, per 6.3).
 *
 * The layer name is whitelisted, so the route can only ever read the
 * known overlay files, never an arbitrary path.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { scopeHistoricOverlay } from "@/lib/map/historicOverlay";

export const runtime = "nodejs";
export const revalidate = 86400;

// Whitelist: committed overlay files only. Public art has its own
// computed route; these are the static GIS pulls.
const ALLOWED = new Set(["parks", "markets", "trails", "historic", "bridges", "county-boundary"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ layer: string }> },
) {
  const { layer } = await params;
  if (!ALLOWED.has(layer)) {
    return NextResponse.json({ error: "unknown overlay" }, { status: 404 });
  }

  let body: string;
  try {
    body = await fs.readFile(
      path.join(process.cwd(), "public", "overlays", `${layer}.geojson`),
      "utf-8",
    );
  } catch {
    // In the registry but not seeded yet: an empty collection, not a 500,
    // so a toggle of a coming-soon layer degrades quietly.
    body = JSON.stringify({ type: "FeatureCollection", features: [] });
  }

  if (layer === "historic") {
    try {
      body = JSON.stringify(scopeHistoricOverlay(JSON.parse(body)));
    } catch {
      body = JSON.stringify({ type: "FeatureCollection", features: [] });
    }
  }

  const etag = `"${createHash("sha1").update(body).digest("hex")}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/geo+json; charset=utf-8",
      ETag: etag,
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
