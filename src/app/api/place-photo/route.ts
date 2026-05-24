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
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";

export const runtime = "nodejs";
// Cache the proxied image aggressively — photos rarely change.
export const revalidate = 604800; // 7 days

const VALID_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

/**
 * SVG placeholder served when upstream fails. Returning a real image
 * (200 + image/svg+xml) instead of an error means the <img> in the
 * page never shows a broken-image icon — it just degrades to a quiet
 * gradient tile. This is what we want for hero/marquee photos where a
 * single 502 used to leave a glaring gap.
 *
 * The hash of the resource name picks a stable hue so two cards on
 * the same screen don't both fall back to the same color.
 */
function placeholderSvg(name: string, w: number): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  const h2 = (hue + 30) % 360;
  const aspect = 4 / 3;
  const hgt = Math.round(w / aspect);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},45%,32%)"/>
      <stop offset="100%" stop-color="hsl(${h2},35%,18%)"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${hgt}" fill="url(#g)"/>
  <circle cx="${w * 0.78}" cy="${hgt * 0.28}" r="${w * 0.12}" fill="hsl(${hue},60%,55%)" fill-opacity="0.18"/>
</svg>`;
}

function placeholderResponse(name: string, w: number, reason: string): Response {
  return new Response(placeholderSvg(name, w), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      // Shorter cache for fallback so a real photo can take over later.
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Photo-Fallback": reason,
    },
  });
}

export async function GET(req: NextRequest) {
  // Abuse guard: this route hits Google Places API on every miss. A
  // foreign Referer / Origin almost certainly means scraping or
  // hotlinking, both of which directly cost us money. Block early.
  // Server-to-server fetches (no headers) are still allowed.
  if (!isSameOriginRequest(req)) {
    return new Response("Forbidden", { status: 403 });
  }
  // Per-IP rate limit: 120 photos/minute is generous (a full
  // viewport of cards is ~6–12 photos, a few page loads is far
  // under). Anyone past 120/min is scraping. No-op when KV isn't
  // configured (see isRateLimited docs).
  if (await isRateLimited(req, "place-photo", 120, 60)) {
    return new Response("Too Many Requests", { status: 429 });
  }

  const name = req.nextUrl.searchParams.get("name");
  const w = Math.min(1600, Math.max(80, parseInt(req.nextUrl.searchParams.get("w") || "800", 10)));

  if (!name || !VALID_NAME.test(name)) {
    return new Response("Bad photo name", { status: 400 });
  }

  const url = photoUrl(name, w);
  if (!url) {
    // Key not configured — degrade to a gradient placeholder so the
    // page still renders coherently in dev / on misconfigured deploys.
    return placeholderResponse(name, w, "no-key");
  }

  try {
    const upstream = await fetch(url, {
      // Google redirects to the actual CDN object; follow it.
      redirect: "follow",
      next: { revalidate: 604800 },
    });
    if (!upstream.ok || !upstream.body) {
      // Upstream 4xx/5xx (rotated photo reference, throttled, etc.) —
      // serve the placeholder so the image element doesn't break.
      return placeholderResponse(name, w, `upstream-${upstream.status}`);
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return placeholderResponse(name, w, "fetch-error");
  }
}
