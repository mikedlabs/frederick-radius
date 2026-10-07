/**
 * Server-side proxy for Google Places photos.
 *
 * Google photo media URLs embed the API key, so we can never put them in
 * client HTML. This route takes a photo resource name, fetches the image
 * server-side with the key, and returns a bounded, temporary per-request body
 * without storing the Google content. Google Places photo names and photo bytes are not ours to mirror
 * or retain, so every successful response is explicitly `no-store`.
 *
 *   /api/place-photo?name=places/XXX/photos/YYY&w=800
 *
 * The `name` MUST be a Google "places/.../photos/..." resource path — we
 * validate the shape to prevent the route being used as an open proxy.
 */
import { reserveDailyUsage } from "@/lib/usage-meter";
import { NextRequest } from "next/server";
import { photoUrl } from "@/lib/integrations/google-places";
import { googlePhotoDailyCap } from "@/lib/google-photo-budget";
import { createAbortDeadline } from "@/lib/promise-deadline";
import {
  isOverPaidRequestBudget,
  isSameOriginRequest,
  isUnattributedRequest,
} from "@/lib/origin-check";
import { PLACE_BY_SLUG } from "@/data/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { BRAND, RIPPLE_GEOMETRY } from "@/lib/brand";

export const runtime = "nodejs";
// A route-level revalidate value would put Google photo bytes in Next/Vercel's
// data cache. Keep this route dynamic and make the upstream request explicit.
export const dynamic = "force-dynamic";

const PHOTO_DEADLINE_MS = 8_000;
// Leave response overhead below the host's 4.5 MB function response limit.
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_PHOTO_READS = 4_096;

const VALID_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const VALID_SLUG = /^[a-z0-9-]+$/;
const PLACEHOLDER_ACCENTS = [
  BRAND.colors.brick,
  BRAND.colors.forest,
  BRAND.colors.plum,
  BRAND.colors.ridge,
] as const;

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
 * page never shows a broken-image icon; it degrades to a quiet Cream tile.
 *
 * The plate carries NO text. Every surface crops this image with
 * `object-cover`, so typeset words became fragments ("RESTA PHOTO Dutch")
 * in list thumbnails, and a Caslon place name painted under an event hero
 * title read as a second, competing title (production, Oct 6-7 2026). A
 * missing photo must look missing: the Cream field, the category's color
 * rule and the Radius ripple, nothing a reader could mistake for content.
 * No OG or share caller depends on a lettered plate; those routes draw their
 * own artwork, so there is no opt-in text variant.
 *
 * Surfaces that have a designed photoless state should not show this plate
 * at all. They ask for `fallback=signal` (see usePlacePhotoState) and get a
 * transparent 1px image they can detect instead.
 */
function placeholderSvg(name: string, w: number, slug?: string): string {
  const aspect = 4 / 3;
  const hgt = Math.round(w / aspect);

  // A known slug keys the rule and ripple to the place's category color.
  const place = slug ? PLACE_BY_SLUG[slug] : undefined;
  let rule: string;
  let ripple: string;
  if (place) {
    const accent = CATEGORY_BY_SLUG[place.category]?.color ?? BRAND.colors.brick;
    rule = accent;
    ripple = accent;
  } else {
    // Generic fallback (no slug or unknown slug): a stable accent pair hashed
    // from the photo name so neighbouring tiles do not all match.
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    const colorIndex = Math.abs(h) % PLACEHOLDER_ACCENTS.length;
    rule = PLACEHOLDER_ACCENTS[colorIndex];
    ripple = PLACEHOLDER_ACCENTS[(colorIndex + 1) % PLACEHOLDER_ACCENTS.length];
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" preserveAspectRatio="xMidYMid slice">
  <rect width="${w}" height="${hgt}" fill="${BRAND.colors.cream}"/>
  <rect width="5" height="${hgt}" fill="${rule}"/>
  ${rippleSvg(ripple, w, hgt)}
</svg>`;
}

function placeholderResponse(
  name: string,
  w: number,
  reason: string,
  slug?: string,
  signal = false,
): Response {
  if (signal) {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"/>',
      {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=300, s-maxage=300",
          "X-Photo-Fallback": reason,
        },
      },
    );
  }
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


/** Return the bounded transport bytes of this exact photo; never a healed retry. */
function imageResponse(upstream: Response, bytes: Uint8Array<ArrayBuffer>): Response {
  return new Response(bytes, {
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

class PhotoBodyError extends Error {
  constructor(readonly reason: "body-too-large" | "body-read-limit" | "body-empty" | "body-incomplete") {
    super(reason);
  }
}

/** Bounded request memory, including small chunks; no file, Blob, or cache writes. */
async function readPhotoBytes(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
  expectedLength?: number,
): Promise<Uint8Array<ArrayBuffer>> {
  let bytes = new Uint8Array(64 * 1024);
  let length = 0;
  let reads = 0;
  for (;;) {
    signal.throwIfAborted();
    const { done, value } = await reader.read();
    signal.throwIfAborted();
    if (done) {
      if (length === 0) throw new PhotoBodyError("body-empty");
      if (expectedLength !== undefined && length !== expectedLength) throw new PhotoBodyError("body-incomplete");
      return bytes.slice(0, length);
    }
    // A finite read ceiling also stops pathological empty/tiny chunks from
    // keeping the event loop in an endless sequence of resolved promises.
    if (++reads > MAX_PHOTO_READS) throw new PhotoBodyError("body-read-limit");
    if (value.byteLength > MAX_PHOTO_BYTES - length) throw new PhotoBodyError("body-too-large");
    const nextLength = length + value.byteLength;
    if (expectedLength !== undefined && nextLength > expectedLength) throw new PhotoBodyError("body-incomplete");
    if (nextLength > bytes.length) {
      const grown = new Uint8Array(Math.min(MAX_PHOTO_BYTES, Math.max(nextLength, bytes.length * 2)));
      grown.set(bytes.subarray(0, length));
      bytes = grown;
    }
    bytes.set(value, length);
    length = nextLength;
  }
}

export async function GET(req: NextRequest) {
  // Abuse guard: this route hits Google Places API on every miss. A
  // foreign Referer / Origin almost certainly means scraping or
  // hotlinking, both of which directly cost us money. Block early.
  // This image route is always loaded as a same-origin browser subresource;
  // every app-owned use is deliberately `unoptimized`, so Next never needs to
  // fetch it server-to-server. A headerless request therefore has no valid
  // paid-media use here and is the cheapest way to drain the shared allowance.
  if (!isSameOriginRequest(req)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (isUnattributedRequest(req)) {
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
  const signalFallback = req.nextUrl.searchParams.get("fallback") === "signal";
  // Defense in depth: even though the loader-generated URLs always
  // contain a clean slug, we validate before using to look the place
  // up in PLACE_BY_SLUG.
  const slug = rawSlug && VALID_SLUG.test(rawSlug) ? rawSlug : undefined;

  if (!name || !VALID_NAME.test(name)) {
    return new Response("Bad photo name", { status: 400 });
  }

  // One deadline covers allowance checks, upstream headers and the full body.
  // A late reservation can conservatively consume a unit, but cannot start a
  // paid request after this caller has stopped waiting. No refund or retry.
  const deadline = createAbortDeadline(PHOTO_DEADLINE_MS, req.signal);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let readerCancelled = false;
  const cancelBody = () => {
    if (!reader || readerCancelled) return;
    readerCancelled = true;
    void reader.cancel().catch(() => {});
  };
  const stoppedReason = () => req.signal.aborted ? "caller-aborted" : "fetch-timeout";
  let onStop!: () => void;
  const stopped = new Promise<Response>((resolve) => {
    onStop = () => {
      cancelBody();
      resolve(placeholderResponse(name, w, stoppedReason(), slug, signalFallback));
    };
    deadline.signal.addEventListener("abort", onStop, { once: true });
    if (deadline.signal.aborted) onStop();
  });
  const work = (async () => {
    deadline.signal.throwIfAborted();
    // Per-IP rate limit: 120 photos/minute is generous (a full viewport of
    // cards is ~6–12 photos, a few page loads is far under). Anyone past that
    // threshold should not trigger another paid upstream request. Return the
    // route's normal artwork fallback instead of a 429, though: a long browsing
    // session or a shared NAT must never turn valid <img> elements into broken
    // icons. No-op when KV is not configured (see isRateLimited docs).
    // The helper still retains its unattributed bucket as defense in depth if
    // this route's strict guard is ever loosened. Same-origin callers use the
    // normal per-IP bucket and degrade to artwork instead of a broken image.
    const rateLimited = await isOverPaidRequestBudget(req, "place-photo", 120, 60, 15);
    deadline.signal.throwIfAborted();
    if (rateLimited) {
      return placeholderResponse(name, w, "rate-limited", slug, signalFallback);
    }

    const url = photoUrl(name, w);
    if (!url) {
      // Key not configured — degrade to a gradient placeholder so the
      // page still renders coherently in dev / on misconfigured deploys.
      return placeholderResponse(name, w, "no-key", slug, signalFallback);
    }

    // A reservation is both the aggregate daily gate and this attempt's usage
    // record. Database uncertainty fails closed so a broken counter cannot turn
    // into unbounded Google spend.
    let reservation: Awaited<ReturnType<typeof reserveDailyUsage>> = null;
    try {
      reservation = await reserveDailyUsage(
        "google_photo",
        googlePhotoDailyCap(),
      );
    } catch {
      // Keep the route safe if the helper's fail-closed contract ever regresses.
    }
    deadline.signal.throwIfAborted();
    if (!reservation) {
      return placeholderResponse(
        name,
        w,
        "budget-unavailable",
        slug,
        signalFallback,
      );
    }
    if (!reservation.reserved) {
      return placeholderResponse(name, w, "daily-cap", slug, signalFallback);
    }
    const upstream = await fetch(url, {
      // Google redirects to the actual CDN object; follow it.
      redirect: "follow",
      cache: "no-store",
      signal: deadline.signal,
    });
    if (deadline.signal.aborted) {
      // Fetch implementations that settle after cancellation still must not
      // leak their late body or replace a response already sent as fallback.
      void upstream.body?.cancel().catch(() => {});
      deadline.signal.throwIfAborted();
    }
    if (!upstream.ok || !upstream.body) {
      void upstream.body?.cancel().catch(() => {});
      // The visible credit belongs to this exact resource name. The scheduled
      // place refresh updates photo identity and attribution together.
      return placeholderResponse(name, w, `upstream-${upstream.status}`, slug, signalFallback);
    }
    // Fetch can decode an encoded response while retaining its wire length.
    // Only identity Content-Length describes the bytes this route receives.
    const encoding = upstream.headers.get("content-encoding")?.trim().toLowerCase();
    const lengthHeader = upstream.headers.get("content-length")?.trim();
    const advertisedBytes = (!encoding || encoding === "identity") && lengthHeader && /^\d+$/.test(lengthHeader)
      ? Number(lengthHeader) : undefined;
    if (advertisedBytes !== undefined && (!Number.isSafeInteger(advertisedBytes) || advertisedBytes > MAX_PHOTO_BYTES)) {
      void upstream.body.cancel().catch(() => {});
      throw new PhotoBodyError("body-too-large");
    }
    reader = upstream.body.getReader();
    try {
      return imageResponse(upstream, await readPhotoBytes(reader, deadline.signal, advertisedBytes));
    } catch (error) {
      cancelBody();
      throw error;
    } finally {
      reader.releaseLock();
      reader = undefined;
    }
  })().catch((error: unknown) => placeholderResponse(
    name,
    w,
    error instanceof PhotoBodyError ? error.reason : deadline.signal.aborted ? stoppedReason() : "fetch-error",
    slug,
    signalFallback,
  ));
  try {
    // Racing as well as aborting keeps a stalled/late transport from holding
    // the public response. The work catch consumes any late rejection.
    return await Promise.race([work, stopped]);
  } finally {
    deadline.signal.removeEventListener("abort", onStop);
    deadline.dispose();
  }
}
