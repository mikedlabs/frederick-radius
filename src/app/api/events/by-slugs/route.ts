import { NextResponse } from "next/server";
import {
  normalizeRequestedEventSlugList,
  normalizeRequestedEventSlugs,
  resolveEventsBySlugs,
} from "@/lib/loaders/eventsBySlugs";
import {
  hasJsonContentType,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

const EMPTY_GET_CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";
const RESOLVED_GET_CACHE = "public, s-maxage=60, stale-while-revalidate=300";
const POST_CACHE = "private, no-store";

// A fully valid request is about 20.3 KB (100 slugs of 200 characters plus
// JSON syntax). The small margin accommodates normal serialization while
// rejecting an attacker-controlled body before JSON parsing or source work.
const MAX_POST_BODY_BYTES = 24 * 1024;

function eventsResponse(events: unknown[], cacheControl: string) {
  return NextResponse.json(
    { events },
    { headers: { "Cache-Control": cacheControl } },
  );
}

async function resolveResponse(slugs: string[], cacheControl: string) {
  if (slugs.length === 0) return eventsResponse([], cacheControl);
  return eventsResponse(await resolveEventsBySlugs(slugs), cacheControl);
}

/**
 * GET /api/events/by-slugs?slugs=a,b,c
 *
 * Returns the renderable EventWithMeta for each known slug, in the order
 * requested. Unknown slugs are quietly dropped. Retained for small existing
 * callers and direct compatibility; SavedList uses the bounded POST below so
 * a personal collection never has to fit in a URL.
 *
 * This is the event sibling of /api/places/by-slugs and exists for the same
 * reason: the saved deck starts from slugs, and the only in-bundle event
 * index a client can hold is the ~30-row curated seed set. Every event saved
 * from a live feed carries a namespaced slug that seed set cannot contain.
 *
 * Limits: 100 slugs per request, 200 characters each (enforced in the
 * normalizer, before any snapshot or archive work).
 *
 * Caching: the saved set is per-device, but the slug→event map is global.
 * A short s-maxage lets the edge collapse repeats while keeping a cancelled
 * or rescheduled event from sitting in a saved deck for long — events move,
 * so this window is tighter than the place equivalent.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slugs = normalizeRequestedEventSlugs(url.searchParams.get("slugs") ?? "");
  return resolveResponse(
    slugs,
    slugs.length === 0 ? EMPTY_GET_CACHE : RESOLVED_GET_CACHE,
  );
}

/**
 * POST /api/events/by-slugs
 * Body: { "slugs": ["a", "b"] }
 *
 * SavedList uses POST so a full personal collection never has to fit inside
 * a browser, CDN, or deployment proxy's URL limit. GET remains available for
 * existing callers and edge-cacheable small sets.
 */
export async function POST(request: Request) {
  if (!hasJsonContentType(request)) {
    return NextResponse.json(
      { error: "unsupported-media-type" },
      { status: 415, headers: { "Cache-Control": POST_CACHE } },
    );
  }

  const body = await readJsonBodyWithLimit(request, MAX_POST_BODY_BYTES);
  if (!body.ok) {
    return NextResponse.json(
      { error: body.error },
      {
        status: body.error === "body-too-large" ? 413 : 400,
        headers: { "Cache-Control": POST_CACHE },
      },
    );
  }

  if (
    !body.value ||
    typeof body.value !== "object" ||
    !Array.isArray((body.value as { slugs?: unknown }).slugs)
  ) {
    return NextResponse.json(
      { error: "invalid-input" },
      { status: 400, headers: { "Cache-Control": POST_CACHE } },
    );
  }

  const slugs = normalizeRequestedEventSlugList(
    (body.value as { slugs: unknown[] }).slugs,
  );
  return resolveResponse(slugs, POST_CACHE);
}
