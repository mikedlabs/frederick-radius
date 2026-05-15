/**
 * Server-side proxy for Google Places photos.
 *
 * Google photo media URLs embed the API key, so we can never put them in
 * client HTML. This route takes a photo resource name, fetches the image
 * server-side with the key, and streams it back with long cache headers
 * (Vercel edge + browser cache make repeat loads free).
 *
 *   /api/place-photo?name=places/XXX/photos/YYY&w=800
 *
 * The `name` MUST be a Google "places/.../photos/..." resource path — we
 * validate the shape to prevent the route being used as an open proxy.
 */
import { NextRequest } from "next/server";
import { photoUrl } from "@/lib/integrations/google-places";

export const runtime = "nodejs";
// Cache the proxied image aggressively — photos rarely change.
export const revalidate = 604800; // 7 days

const VALID_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  const w = Math.min(1600, Math.max(80, parseInt(req.nextUrl.searchParams.get("w") || "800", 10)));

  if (!name || !VALID_NAME.test(name)) {
    return new Response("Bad photo name", { status: 400 });
  }

  const url = photoUrl(name, w);
  if (!url) {
    // Key not configured — let the caller fall back to gradient/glyph
    return new Response("Photos not configured", { status: 404 });
  }

  try {
    const upstream = await fetch(url, {
      // Google redirects to the actual CDN object; follow it.
      redirect: "follow",
      next: { revalidate: 604800 },
    });
    if (!upstream.ok || !upstream.body) {
      return new Response("Upstream error", { status: 502 });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new Response("Fetch failed", { status: 502 });
  }
}
