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
import { meterUsage } from "@/lib/usage-meter";
import { NextRequest } from "next/server";
import { list, put } from "@vercel/blob";
import { photoUrl } from "@/lib/integrations/google-places";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";
import { PLACE_BY_SLUG } from "@/data/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";

export const runtime = "nodejs";
// Cache the proxied image aggressively — photos rarely change.
export const revalidate = 604800; // 7 days

/**
 * Cost control: mirror each Google photo to Vercel Blob the FIRST time
 * it's requested, then 308-redirect to the CDN copy forever after. Google
 * Place Photo (~$7/1k) is billed once per photo ever — not once per
 * edge-cache cycle — and the image bytes then serve from cheap blob/CDN
 * instead of streaming through this function. No-ops gracefully when
 * BLOB_READ_WRITE_TOKEN isn't set (falls back to streaming below).
 */
async function serveFromBlob(name: string, w: number, googleUrl: string): Promise<Response | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const key = `place-photos/${name.replace(/[^A-Za-z0-9_-]/g, "_")}_${w}.jpg`;
  const redirect = (u: string) =>
    new Response(null, {
      status: 308,
      headers: { Location: u, "Cache-Control": "public, max-age=2592000, s-maxage=2592000" },
    });
  try {
    const { blobs } = await list({ prefix: key, limit: 1 });
    const existing = blobs.find((b) => b.pathname === key);
    if (existing) return redirect(existing.url); // already mirrored — no Google call
    meterUsage("google_photo");
    const up = await fetch(googleUrl, { redirect: "follow" });
    if (!up.ok) return null; // let the streaming path handle the failure/placeholder
    const buf = Buffer.from(await up.arrayBuffer());
    const { url } = await put(key, buf, {
      access: "public",
      addRandomSuffix: false,
      contentType: up.headers.get("content-type") || "image/jpeg",
    });
    return redirect(url);
  } catch {
    return null; // any blob hiccup → graceful fallback to streaming
  }
}

const VALID_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const VALID_SLUG = /^[a-z0-9-]+$/;

/**
 * Pull display initials from a place name. "Brewers Alley" → "BA";
 * "Sumittra Thai Cuisine" → "ST"; single-word "Tabù" → "TA". Anything
 * already two characters or shorter stays as-is. Drops parens / dashes
 * / business filler.
 */
function initialsOf(name: string): string {
  const words = name
    .replace(/[(),'.&]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(the|of|and|at|in|on)$/i.test(w));
  if (words.length === 0) return "FR";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * SVG placeholder served when upstream fails. Returning a real image
 * (200 + image/svg+xml) instead of an error means the <img> in the
 * page never shows a broken-image icon — it just degrades to a quiet
 * gradient tile. This is what we want for hero/marquee photos where a
 * single 502 used to leave a glaring gap.
 *
 * When the caller passes a place slug, we render a RICHER fallback:
 * place initials in big serif type on a category-colored gradient. A
 * lot more like a "this is a real place we just don't have a photo
 * for right now" tile than the old generic gradient circle. Falls
 * back to the hash-colored gradient when no slug or no place match,
 * so the function is always safe to call.
 */
function placeholderSvg(name: string, w: number, slug?: string): string {
  const aspect = 4 / 3;
  const hgt = Math.round(w / aspect);

  // Rich path: known slug → use the place's name + category color
  const place = slug ? PLACE_BY_SLUG[slug] : undefined;
  if (place) {
    const cat = CATEGORY_BY_SLUG[place.category];
    const accent = cat?.color ?? "#A03A22";
    const ini = initialsOf(place.name);
    const fontSize = Math.round(hgt * 0.42);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.18"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${hgt}" fill="#1A1815"/>
  <rect width="${w}" height="${hgt}" fill="url(#g)"/>
  <text x="${w / 2}" y="${hgt / 2}" text-anchor="middle" dominant-baseline="central" font-family="Georgia, 'Times New Roman', serif" font-weight="600" font-size="${fontSize}" fill="${accent}" fill-opacity="0.88" letter-spacing="${Math.round(fontSize * 0.04)}">${ini}</text>
</svg>`;
  }

  // Generic gradient fallback (no slug or unknown slug).
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  const h2 = (hue + 30) % 360;
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

function placeholderResponse(name: string, w: number, reason: string, slug?: string): Response {
  return new Response(placeholderSvg(name, w, slug), {
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
  // parseInt("abc") is NaN, and `|| "800"` only defends an empty/missing
  // param — not a non-numeric one. Without the finite check a hand-crafted
  // `?w=abc` propagates NaN into the Google photo URL (maxWidthPx=NaN, 400s)
  // and the placeholder SVG (width="NaN"). Coerce any non-finite result
  // back to the default. (App-generated URLs always pass a clean integer.)
  const wRaw = parseInt(req.nextUrl.searchParams.get("w") || "800", 10);
  const w = Math.min(1600, Math.max(80, Number.isFinite(wRaw) ? wRaw : 800));
  const rawSlug = req.nextUrl.searchParams.get("slug") || undefined;
  // Defense in depth: even though the loader-generated URLs always
  // contain a clean slug, we validate before using to look the place
  // up in PLACE_BY_SLUG.
  const slug = rawSlug && VALID_SLUG.test(rawSlug) ? rawSlug : undefined;

  if (!name || !VALID_NAME.test(name)) {
    return new Response("Bad photo name", { status: 400 });
  }

  const url = photoUrl(name, w);
  if (!url) {
    // Key not configured — degrade to a gradient placeholder so the
    // page still renders coherently in dev / on misconfigured deploys.
    return placeholderResponse(name, w, "no-key", slug);
  }

  // Serve from (or populate) the blob mirror first — bills Google once
  // per photo ever. Returns null when blob isn't configured / fails, in
  // which case we fall through to the original streaming path.
  const mirrored = await serveFromBlob(name, w, url);
  if (mirrored) return mirrored;

  try {
    meterUsage("google_photo");
    const upstream = await fetch(url, {
      // Google redirects to the actual CDN object; follow it.
      redirect: "follow",
      next: { revalidate: 604800 },
    });
    if (!upstream.ok || !upstream.body) {
      // Upstream 4xx/5xx (rotated photo reference, throttled, etc.) —
      // serve the placeholder so the image element doesn't break.
      return placeholderResponse(name, w, `upstream-${upstream.status}`, slug);
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return placeholderResponse(name, w, "fetch-error", slug);
  }
}
