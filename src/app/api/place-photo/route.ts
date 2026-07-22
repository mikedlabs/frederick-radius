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
import { BRAND, RIPPLE_GEOMETRY } from "@/lib/brand";

export const runtime = "nodejs";
// A route-level revalidate value would put Google photo bytes in Next/Vercel's
// data cache. Keep this route dynamic and make the upstream request explicit.
export const dynamic = "force-dynamic";

const VALID_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const VALID_SLUG = /^[a-z0-9-]+$/;
const PLACEHOLDER_ACCENTS = [
  BRAND.colors.brick,
  BRAND.colors.forest,
  BRAND.colors.plum,
  BRAND.colors.ridge,
] as const;
const SVG_FONT_FACES = `<style>
  @font-face{font-family:'Public Sans';src:url('/brand/fonts/public-sans-variable.woff2') format('woff2');font-style:normal;font-weight:100 900}
  @font-face{font-family:'Libre Caslon Display';src:url('/brand/fonts/libre-caslon-display-400.woff2') format('woff2');font-style:normal;font-weight:400}
</style>`;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function rippleSvg(accent: string, w: number, hgt: number): string {
  const scale = Math.max(2.4, hgt / 118);
  const x = w - 94 * scale;
  const y = -18 * scale;
  const paths = RIPPLE_GEOMETRY.full.paths
    .map((path, index) => `<path d="${path}" stroke-opacity="${RIPPLE_GEOMETRY.full.opacities[index]}"/>`)
    .join("");
  return `<g transform="translate(${x} ${y}) scale(${scale}) translate(0 ${RIPPLE_GEOMETRY.full.opticalOffsetY})"><g fill="none" stroke="${accent}" stroke-linecap="round" stroke-width="2.2">${paths}</g><circle cx="50" cy="${RIPPLE_GEOMETRY.full.baseline}" r="${RIPPLE_GEOMETRY.full.dotRadius}" fill="${accent}"/></g>`;
}

/**
 * SVG placeholder served when upstream fails. Returning a real image
 * (200 + image/svg+xml) instead of an error means the <img> in the
 * page never shows a broken-image icon — it just degrades to a quiet
 * gradient tile. This is what we want for hero/marquee photos where a
 * single 502 used to leave a glaring gap.
 *
 * When the caller passes a place slug, the plate identifies the listing and
 * its category without pretending that generated initials are photography.
 * The actual Radius ripple makes the degraded state unmistakably ours.
 */
function placeholderSvg(name: string, w: number, slug?: string): string {
  const aspect = 4 / 3;
  const hgt = Math.round(w / aspect);

  // Rich path: known slug → use the place's name + category color
  const place = slug ? PLACE_BY_SLUG[slug] : undefined;
  if (place) {
    const cat = CATEGORY_BY_SLUG[place.category];
    const accent = cat?.color ?? BRAND.colors.brick;
    const placeName = escapeXml(place.name);
    const category = escapeXml((cat?.name ?? place.category ?? "Place").toUpperCase());
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" preserveAspectRatio="xMidYMid slice">
  ${SVG_FONT_FACES}
  <rect width="${w}" height="${hgt}" fill="${BRAND.colors.cream}"/>
  <rect width="5" height="${hgt}" fill="${accent}"/>
  ${rippleSvg(accent, w, hgt)}
  <line x1="32" y1="${Math.round(hgt * 0.28)}" x2="${Math.round(w * 0.52)}" y2="${Math.round(hgt * 0.28)}" stroke="${BRAND.colors.border}"/>
  <text x="32" y="${Math.round(hgt * 0.19)}" font-family="Public Sans, Arial, Helvetica, sans-serif" font-size="${Math.max(11, Math.round(hgt * 0.026))}" font-weight="700" letter-spacing="2.4" fill="${accent}">${category}</text>
  <text x="32" y="${Math.round(hgt * 0.37)}" font-family="Public Sans, Arial, Helvetica, sans-serif" font-size="${Math.max(10, Math.round(hgt * 0.023))}" letter-spacing="1.4" fill="${BRAND.colors.mutedInk}">PHOTO NOT AVAILABLE</text>
  <text x="32" y="${Math.round(hgt * 0.82)}" font-family="Libre Caslon Display, Georgia, serif" font-size="${Math.max(20, Math.round(hgt * 0.075))}" fill="${BRAND.colors.ink}">${placeName}</text>
</svg>`;
  }

  // Generic gradient fallback (no slug or unknown slug).
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const colorIndex = Math.abs(h) % PLACEHOLDER_ACCENTS.length;
  const first = PLACEHOLDER_ACCENTS[colorIndex];
  const second = PLACEHOLDER_ACCENTS[(colorIndex + 1) % PLACEHOLDER_ACCENTS.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" preserveAspectRatio="xMidYMid slice">
  ${SVG_FONT_FACES}
  <rect width="${w}" height="${hgt}" fill="${BRAND.colors.cream}"/>
  <rect width="5" height="${hgt}" fill="${first}"/>
  ${rippleSvg(second, w, hgt)}
  <text x="32" y="${Math.round(hgt * 0.20)}" font-family="Public Sans, Arial, Helvetica, sans-serif" font-size="${Math.max(11, Math.round(hgt * 0.026))}" font-weight="700" letter-spacing="2.4" fill="${first}">FREDERICK RADIUS</text>
  <text x="32" y="${Math.round(hgt * 0.36)}" font-family="Public Sans, Arial, Helvetica, sans-serif" font-size="${Math.max(10, Math.round(hgt * 0.023))}" letter-spacing="1.4" fill="${BRAND.colors.mutedInk}">PHOTO NOT AVAILABLE</text>
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

  // Per-IP rate limit: 120 photos/minute is generous (a full viewport of
  // cards is ~6–12 photos, a few page loads is far under). Anyone past that
  // threshold should not trigger another paid upstream request. Return the
  // route's normal artwork fallback instead of a 429, though: a long browsing
  // session or a shared NAT must never turn valid <img> elements into broken
  // icons. No-op when KV is not configured (see isRateLimited docs).
  if (await isRateLimited(req, "place-photo", 120, 60)) {
    return placeholderResponse(name, w, "rate-limited", slug);
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
