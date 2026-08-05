import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin byte-range relay for the basemap bench (task #36).
 *
 * The Protomaps demo bucket only answers cross-origin requests from
 * Protomaps' own domains, so the bench's MapLibre pane rendered nothing but
 * the flavor's ground color: the browser blocked every tile read. This
 * route forwards the PMTiles Range reads server to server, where CORS does
 * not apply, and the bench fetches from our own origin instead.
 *
 * Bench-only by design: it lives under /admin (Basic Auth gates it and the
 * browser reuses those credentials for same-prefix requests), and the
 * production migration still self-hosts a county extract — this relay is
 * how the owner judges the flavor, not how /map would ship.
 */

const DEMO_TILES = "https://demo-bucket.protomaps.com/v4.pmtiles";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const range = req.headers.get("range");
  const upstream = await fetch(DEMO_TILES, {
    headers: {
      ...(range ? { range } : {}),
      accept: "application/octet-stream",
    },
    // Tile bytes are immutable per build; let the platform cache ranges.
    cache: "no-store",
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse("Tile source unavailable.", {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  const headers = new Headers();
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("cache-control", "private, max-age=3600");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
