/**
 * POST /api/travel-matrix — one explicit Frederick County origin to a short
 * candidate list, ranked with real Mapbox walking/cycling/driving time.
 *
 * Body:
 * {
 *   profile: "walking" | "cycling" | "driving" | "driving-traffic",
 *   origin: { lng, lat },
 *   destinations: [{ lng, lat }, ...] // 2–9
 * }
 *
 * POST keeps a user's approximate origin out of the request URL and access
 * logs. The endpoint never derives location from IP or request headers.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  getMapboxTravelMatrix,
  normalizeMapboxMatrixInput,
} from "@/lib/integrations/mapboxMatrix";
import {
  hasJsonContentType,
  isRateLimited,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;
const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export async function POST(req: NextRequest) {
  // This is a paid, browser-facing POST. Require an app origin even though it
  // does not mutate data; server code should call getMapboxTravelMatrix()
  // directly instead of proxying through this route.
  if (!isSameOriginMutationRequest(req)) {
    return json({ ok: false, reason: "forbidden-origin" }, 403);
  }
  if (
    await isRateLimited(
      req,
      "travel-matrix",
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

  const normalized = normalizeMapboxMatrixInput(body.value);
  if (!normalized.ok) {
    return json({ ok: false, reason: normalized.reason }, 400);
  }

  // Upstream/configuration failures intentionally retain HTTP 200 with an
  // explicit ok:false contract. Callers can keep their local distance fallback
  // without treating a metered enrichment outage as a broken product request.
  return json(await getMapboxTravelMatrix(normalized.value));
}
