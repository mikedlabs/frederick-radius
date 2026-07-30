/**
 * Static overlay endpoint (data brief 6.3 pipeline).
 *
 * Serves the independently reusable U.S. Census county boundary. Former
 * transformed County GIS copies are intentionally absent until written reuse
 * permission defines the allowed transformations, caching, and attribution.
 *
 * The layer name is whitelisted, so the route can only ever read the
 * known overlay files, never an arbitrary path.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const revalidate = 86400;

// Public art has its own computed route. No County-derived static file is
// reachable through this endpoint.
const ALLOWED = new Set(["county-boundary"]);

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
