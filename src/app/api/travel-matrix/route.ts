/**
 * Bounded Mapbox Matrix proxy for the Radius "Within reach" shortlist.
 *
 * One rounded origin plus 2–9 destinations becomes a one-to-many Matrix
 * request. Nine is the hard common ceiling because driving-traffic allows
 * 10 total coordinates. Walking/cycling deliberately use the same shape.
 *
 * Successful duration cells replace the UI's straight-line estimates.
 * Missing cells and every failure stay fail-soft, so the existing `~Nm`
 * estimates remain useful.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isValidCoord } from "@/lib/geo";
import {
  getMapboxTravelMatrix,
  normalizeMapboxMatrixInput,
} from "@/lib/integrations/mapboxMatrix";
import {
  MAPBOX_SERVER_HEADERS,
  MAPBOX_SERVER_TOKEN,
} from "@/lib/mapbox-server";
import {
  MATRIX_MAX_DESTINATIONS,
  MATRIX_MIN_DESTINATIONS,
  isMatrixTravelMode,
  parseMatrixDestination,
  type MatrixEtaSuccess,
  type MatrixTravelMode,
} from "@/lib/mapboxMatrix";
import {
  mapboxDailyUsageCap,
  mapboxMatrixRuntimeEnabled,
} from "@/lib/mapbox-budget";
import {
  hasJsonContentType,
  isOverPaidRequestBudget,
  isRateLimited,
  isSameOriginMutationRequest,
  isSameOriginRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";
import { reserveDailyUsage } from "@/lib/usage-meter";
import { roundCoord } from "@/lib/walkTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;
const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

const PROFILES: Record<MatrixTravelMode, string> = {
  walk: "walking",
  bike: "cycling",
  drive: "driving-traffic",
};

type MapboxMatrixData = {
  code?: string;
  durations?: Array<Array<number | null>>;
};

class MapboxMatrixError extends Error {
  constructor(readonly status: number) {
    super(`Mapbox Matrix HTTP ${status}`);
  }
}

class MapboxMatrixBudgetError extends Error {
  constructor(readonly reason: "cost-control-unavailable" | "daily-cap-reached") {
    super(reason);
  }
}

async function fetchMatrix(
  profile: string,
  coordinatePath: string,
  destinationIndexes: string,
  elementCount: number,
): Promise<MapboxMatrixData> {
  const upstream =
    `https://api.mapbox.com/directions-matrix/v1/mapbox/${profile}/${coordinatePath}` +
    `?sources=0&destinations=${destinationIndexes}&annotations=duration&access_token=${MAPBOX_SERVER_TOKEN}`;

  // Matrix is billed by returned element. Reserve immediately before every
  // upstream call; responses are neither persisted nor put in an HTTP cache.
  const reservation = await reserveDailyUsage(
    "mapbox_matrix",
    mapboxDailyUsageCap("matrix_element"),
    elementCount,
  );
  if (!reservation) {
    throw new MapboxMatrixBudgetError("cost-control-unavailable");
  }
  if (!reservation.reserved) {
    throw new MapboxMatrixBudgetError("daily-cap-reached");
  }
  const response = await fetch(upstream, {
    headers: MAPBOX_SERVER_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new MapboxMatrixError(response.status);
  return (await response.json()) as MapboxMatrixData;
}

function numberParam(value: string | null): number {
  return value === null || value.trim() === "" ? Number.NaN : Number(value);
}

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export async function GET(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return new Response("Forbidden", { status: 403 });
  }
  // The breaker is checked before validation, counters, or provider work.
  if (!mapboxMatrixRuntimeEnabled()) {
    return json({ ok: false, reason: "disabled" });
  }
  // A settled radius sends one debounced request. Thirty per minute leaves
  // generous room for real exploration while containing forged loops.
  if (await isOverPaidRequestBudget(req, "travel-matrix", 30, 60, 5)) {
    return new Response("Too Many Requests", { status: 429 });
  }

  const sp = req.nextUrl.searchParams;
  const olng = numberParam(sp.get("olng"));
  const olat = numberParam(sp.get("olat"));
  const mode = sp.get("mode") ?? "";
  const rawDestinations = sp.getAll("d");

  if (!Number.isFinite(olng) || !Number.isFinite(olat)) {
    return Response.json({ ok: false, reason: "bad-coords" }, { status: 400 });
  }
  if (!isMatrixTravelMode(mode)) {
    return Response.json({ ok: false, reason: "bad-mode" }, { status: 400 });
  }
  if (
    rawDestinations.length < MATRIX_MIN_DESTINATIONS ||
    rawDestinations.length > MATRIX_MAX_DESTINATIONS
  ) {
    return Response.json(
      { ok: false, reason: "bad-destination-count" },
      { status: 400 },
    );
  }

  const destinations = rawDestinations.map(parseMatrixDestination);
  if (destinations.some((destination) => destination === null)) {
    return Response.json(
      { ok: false, reason: "bad-destinations" },
      { status: 400 },
    );
  }
  const parsedDestinations = destinations.filter(
    (destination) => destination !== null,
  );
  if (new Set(parsedDestinations.map((destination) => destination.id)).size !==
      parsedDestinations.length) {
    return Response.json(
      { ok: false, reason: "duplicate-destinations" },
      { status: 400 },
    );
  }
  if (
    !isValidCoord({ lng: olng, lat: olat }) ||
    parsedDestinations.some(
      (destination) =>
        !isValidCoord({ lng: destination.lng, lat: destination.lat }),
    )
  ) {
    return Response.json(
      { ok: false, reason: "out-of-county" },
      { status: 400 },
    );
  }

  const approximateLng = roundCoord(olng);
  const approximateLat = roundCoord(olat);
  if (!isValidCoord({ lng: approximateLng, lat: approximateLat })) {
    return Response.json(
      { ok: false, reason: "out-of-county" },
      { status: 400 },
    );
  }
  if (olng !== approximateLng || olat !== approximateLat) {
    const canonical = req.nextUrl.clone();
    canonical.searchParams.set("olng", String(approximateLng));
    canonical.searchParams.set("olat", String(approximateLat));
    return new Response(null, {
      status: 307,
      headers: {
        Location: canonical.toString(),
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (!MAPBOX_SERVER_TOKEN) {
    return Response.json({ ok: false, reason: "no-token" });
  }

  const coordinatePath = [
    `${approximateLng},${approximateLat}`,
    ...parsedDestinations.map(
      (destination) => `${destination.lng},${destination.lat}`,
    ),
  ].join(";");
  const destinationIndexes = parsedDestinations
    .map((_, index) => String(index + 1))
    .join(";");
  try {
    const data = await fetchMatrix(
      PROFILES[mode],
      coordinatePath,
      destinationIndexes,
      parsedDestinations.length,
    );
    const row = data.durations?.[0];
    if (data.code !== "Ok" || !Array.isArray(row)) {
      return Response.json({ ok: false, reason: "no-route" });
    }

    const durations: Record<string, number> = {};
    parsedDestinations.forEach((destination, index) => {
      const seconds = row[index];
      if (
        typeof seconds === "number" &&
        Number.isFinite(seconds) &&
        seconds >= 0
      ) {
        durations[destination.id] = Math.max(1, Math.round(seconds / 60));
      }
    });
    if (Object.keys(durations).length === 0) {
      return Response.json({ ok: false, reason: "no-route" });
    }

    const response: MatrixEtaSuccess = {
      ok: true,
      mode,
      durations,
    };
    // Never persist Matrix responses or put them in a browser/CDN cache. This
    // keeps the operator breaker immediate and avoids assuming a provider
    // response-storage permission that Radius has not documented.
    return json(response);
  } catch (error) {
    if (error instanceof MapboxMatrixBudgetError) {
      return Response.json({ ok: false, reason: error.reason });
    }
    if (error instanceof MapboxMatrixError) {
      return Response.json({
        ok: false,
        reason: `upstream-${error.status}`,
      });
    }
    return Response.json({ ok: false, reason: "fetch-error" });
  }
}

/**
 * POST keeps a user's approximate origin out of the request URL and access
 * logs. The endpoint never derives location from IP or request headers.
 */
export async function POST(req: NextRequest) {
  // This is a paid, browser-facing POST. Require an app origin even though it
  // does not mutate data; server code should call getMapboxTravelMatrix()
  // directly instead of proxying through this route.
  if (!isSameOriginMutationRequest(req)) {
    return json({ ok: false, reason: "forbidden-origin" }, 403);
  }
  // Keep the route-level contract honest even when the integration is mocked
  // in tests or replaced later. The integration repeats this check so direct
  // server callers receive the same fail-soft behavior.
  if (!mapboxMatrixRuntimeEnabled()) {
    return json({ ok: false, reason: "disabled" });
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
