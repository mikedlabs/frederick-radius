import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin relay for the bench's sprite and glyph assets (task #36).
 *
 * The tiles already relay through /admin/basemap/tiles, but the style also
 * reads sprites and font glyphs from protomaps.github.io directly in the
 * browser. Any environment that can't reach that host (locked-down egress,
 * CI, offline judging) renders a blank flavor pane with a fetch error —
 * which looks like a style failure, not a network one. Relaying the assets
 * from our own origin removes the bench's last third-party browser fetch;
 * the production migration self-hosts these files with the county extract.
 */

const ASSET_UPSTREAM = "https://protomaps.github.io/basemaps-assets";

// Only the two asset families the style spec actually references.
const ALLOWED = /^(sprites|fonts)\//;

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await ctx.params;
  const rel = path.join("/");
  if (!ALLOWED.test(rel) || rel.includes("..")) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const upstream = await fetch(`${ASSET_UPSTREAM}/${rel}`, {
    cache: "no-store",
  });
  if (!upstream.ok) {
    return new NextResponse("Asset source unavailable.", {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  // fetch() has already decompressed the body, so the upstream
  // content-length/encoding headers describe bytes we no longer have —
  // forwarding them truncates the sprite JSON mid-parse. Buffer and let
  // the platform size the response itself.
  const body = await upstream.arrayBuffer();
  const headers = new Headers();
  for (const name of ["content-type", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("cache-control", "private, max-age=3600");

  return new NextResponse(body, { status: 200, headers });
}
