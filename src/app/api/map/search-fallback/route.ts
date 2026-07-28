/**
 * POST /api/map/search-fallback
 *
 * A last-resort map search after Radius's own canonical index has no useful
 * match. The response is temporary Mapbox data: the client may show it for the
 * active search session, but it must not save it into Radius.
 *
 * Suggest body:
 * {
 *   action: "suggest",
 *   q: string,
 *   sessionToken: UUIDv4,
 *   proximity: { lng, lat },
 *   limit?: 1..4,
 *   route?: encoded polyline,
 *   routeGeometry?: "polyline" | "polyline6",
 *   timeDeviation?: number
 * }
 *
 * Retrieve body:
 * {
 *   action: "retrieve",
 *   mapboxId: string,
 *   sessionToken: the same UUIDv4 used for suggest,
 *   proximity: { lng, lat }
 * }
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  normalizeMapboxSearchBoxInput,
  searchMapboxTemporary,
} from "@/lib/integrations/mapboxSearchBox";
import {
  hasJsonContentType,
  isRateLimited,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutationRequest(req)) {
    return json({ ok: false, reason: "forbidden-origin" }, 403);
  }
  if (
    await isRateLimited(
      req,
      "map-search-fallback",
      RATE_LIMIT,
      RATE_WINDOW_SECONDS,
    )
  ) {
    return NextResponse.json(
      { ok: false, reason: "rate-limited" },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": String(RATE_WINDOW_SECONDS),
        },
      },
    );
  }
  if (!hasJsonContentType(req)) {
    return json({ ok: false, reason: "unsupported-media-type" }, 415);
  }

  const body = await readJsonBodyWithLimit(req, MAX_BODY_BYTES);
  if (!body.ok) {
    return json(
      { ok: false, reason: body.error },
      body.error === "body-too-large" ? 413 : 400,
    );
  }

  const normalized = normalizeMapboxSearchBoxInput(body.value);
  if (!normalized.ok) {
    return json({ ok: false, reason: normalized.reason }, 400);
  }

  // A temporary upstream outage is not a broken Radius search request.
  // The map keeps its empty/local state and can offer another query.
  return json(await searchMapboxTemporary(normalized.value));
}
