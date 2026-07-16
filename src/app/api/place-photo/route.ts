/**
 * Server-side proxy for Google Places photos.
 *
 * Google photo media URLs embed the API key, so we can never put them in
 * client HTML. This route takes a photo resource name, fetches the image
 * server-side with the key, and streams it back without storing the Google
 * content. Google Places photo names and photo bytes are not ours to mirror
 * or retain, so every successful response is explicitly `no-store`.
 *
 *   /api/place-photo?name=places/XXX/photos/YYY&w=800
 *
 * The `name` MUST be a Google "places/.../photos/..." resource path — we
 * validate the shape to prevent the route being used as an open proxy.
 */
import { meterUsage } from "@/lib/usage-meter";
import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { photoUrl, getPlaceDetails } from "@/lib/integrations/google-places";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";
import { PLACE_BY_SLUG } from "@/data/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";

export const runtime = "nodejs";
// A route-level revalidate value would put Google photo bytes in Next/Vercel's
// data cache. Keep this route dynamic and make the upstream request explicit.
export const dynamic = "force-dynamic";

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


/** Success passthrough — shared by the first attempt and the healed retry. */
function imageResponse(upstream: Response): Response {
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
      // Do not retain or re-host Places content in the browser, Next data
      // cache, or Vercel CDN. The endpoint remains a key-safe same-origin
      // transport only.
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

/**
 * Photo SELF-HEAL. Google rotates photo resource names, and ours are
 * stamped statically into the dataset — so they all eventually expire and
 * every thumbnail on prod degraded to the initials tile (owner report,
 * Jul 2026; every media fetch returned 400). On a 4xx we look up the
 * place's CURRENT photo names (the id is embedded in the stale name),
 * cached for a week per place so healing costs about one details call
 * per stale place per week, and serve the real image. An empty result
 * THROWS so a transient failure is never cached as "no photos" for a week
 * (same sentinel pattern as the ask answer cache). The durable refill is
 * regenerating the dataset; this keeps the app whole between refills.
 */
const freshPhotoNames = unstable_cache(
  async (placeId: string): Promise<string[]> => {
    const d = await getPlaceDetails(placeId, "photos");
    if (!d || d.photo_names.length === 0) throw new Error("photo-heal:none");
    return d.photo_names;
  },
  ["photo-heal-v1"],
  { revalidate: 7 * 24 * 3600 },
);

async function healAndFetch(staleName: string, w: number): Promise<Response | null> {
  const placeId = staleName.split("/")[1];
  if (!placeId) return null;
  let fresh: string[];
  try {
    fresh = await freshPhotoNames(`places/${placeId}`);
  } catch {
    return null;
  }
  // The stale name's position in the old array is unknowable here, so pick a
  // STABLE pseudo-index from the name hash: gallery tiles heal to distinct,
  // consistent photos of the right place instead of all collapsing to [0].
  let h = 0;
  for (let i = 0; i < staleName.length; i++) h = (h * 31 + staleName.charCodeAt(i)) | 0;
  const candidate = fresh[Math.abs(h) % fresh.length];
  if (!candidate || candidate === staleName) return null;
  const url = photoUrl(candidate, w);
  if (!url) return null;
  meterUsage("google_photo");
  const retry = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!retry.ok || !retry.body) return null;
  return imageResponse(retry);
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

  try {
    meterUsage("google_photo");
    const upstream = await fetch(url, {
      // Google redirects to the actual CDN object; follow it.
      redirect: "follow",
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) {
      // A 4xx usually means Google ROTATED the photo name out from under the
      // dataset — try the self-heal before conceding a placeholder.
      if (upstream.status >= 400 && upstream.status < 500) {
        try {
          const healed = await healAndFetch(name, w);
          if (healed) return healed;
        } catch {
          /* fall through to the placeholder */
        }
      }
      return placeholderResponse(name, w, `upstream-${upstream.status}`, slug);
    }
    return imageResponse(upstream);
  } catch {
    return placeholderResponse(name, w, "fetch-error", slug);
  }
}
