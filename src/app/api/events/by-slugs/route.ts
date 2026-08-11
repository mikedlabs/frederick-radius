import { NextResponse } from "next/server";
import {
  normalizeRequestedEventSlugList,
  normalizeRequestedEventSlugs,
  resolveEventsBySlugsWithStatus,
  type EventsBySlugsResolution,
} from "@/lib/loaders/eventsBySlugs";
import {
  hasJsonContentType,
  isRateLimited,
  isSameOriginMutationRequest,
  isSameOriginRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

const EMPTY_GET_CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";
const RESOLVED_GET_CACHE = "public, s-maxage=60, stale-while-revalidate=300";
const POST_CACHE = "private, no-store";
const NO_STORE = "private, no-store, max-age=0";
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 60;

// A fully valid request is about 20.3 KB (100 slugs of 200 characters plus
// JSON syntax). The small margin accommodates normal serialization while
// rejecting an attacker-controlled body before JSON parsing or source work.
const MAX_POST_BODY_BYTES = 24 * 1024;

function eventsResponse(
  result: EventsBySlugsResolution,
  cacheControl: string,
) {
  return NextResponse.json(
    result,
    {
      headers: {
        // Never let a transient partial archive/feed answer poison the shared
        // GET cache. POST is already private/no-store.
        "Cache-Control": result.degraded ? NO_STORE : cacheControl,
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function guardedError(error: string, status: number) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": NO_STORE,
        "X-Content-Type-Options": "nosniff",
        ...(status === 429
          ? { "Retry-After": String(RATE_WINDOW_SECONDS) }
          : {}),
      },
    },
  );
}

async function resolveResponse(slugs: string[], cacheControl: string) {
  if (slugs.length === 0) {
    return eventsResponse(
      {
        events: [],
        resolvedSlugs: [],
        unresolvedSlugs: [],
        missingSlugs: [],
        degraded: false,
      },
      cacheControl,
    );
  }
  const result = await resolveEventsBySlugsWithStatus(slugs);
  return eventsResponse(result, cacheControl);
}

/**
 * GET /api/events/by-slugs?slugs=a,b,c
 *
 * Returns the renderable EventWithMeta for each known slug, in the order
 * requested. Additional status arrays distinguish a confirmed missing slug
 * from one a degraded source could not resolve. Existing clients can continue
 * reading only `events`; SavedList uses the bounded POST below so a personal
 * collection never has to fit in a URL.
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
  // Public data, but an application-only batch primitive. Reject browser
  // hot-linking/foreign origins while retaining headerless server reads and
  // local development through the established read-route guard.
  if (!isSameOriginRequest(request)) return guardedError("forbidden-origin", 403);
  if (
    await isRateLimited(
      request,
      "events-by-slugs",
      RATE_LIMIT,
      RATE_WINDOW_SECONDS,
    )
  ) {
    return guardedError("rate-limited", 429);
  }
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
  if (!isSameOriginMutationRequest(request)) {
    return guardedError("forbidden-origin", 403);
  }
  if (
    await isRateLimited(
      request,
      "events-by-slugs",
      RATE_LIMIT,
      RATE_WINDOW_SECONDS,
    )
  ) {
    return guardedError("rate-limited", 429);
  }
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
