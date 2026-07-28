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
import { unstable_cache } from "next/cache";
import { NextRequest } from "next/server";
import { isValidCoord } from "@/lib/geo";
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
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";
import { meterUsage } from "@/lib/usage-meter";
import { roundCoord } from "@/lib/walkTime";

export const runtime = "nodejs";

const DAY_SECONDS = 86_400;
const TRAFFIC_CACHE_SECONDS = 300;

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

async function fetchMatrixUncached(
  profile: string,
  coordinatePath: string,
  destinationIndexes: string,
  elementCount: number,
): Promise<MapboxMatrixData> {
  const upstream =
    `https://api.mapbox.com/directions-matrix/v1/mapbox/${profile}/${coordinatePath}` +
    `?sources=0&destinations=${destinationIndexes}&annotations=duration&access_token=${MAPBOX_SERVER_TOKEN}`;

  // Matrix is billed by returned element. The meter sits inside the cache-miss
  // function so a shared cached shortlist never increments twice.
  meterUsage("mapbox_matrix", elementCount);
  const response = await fetch(upstream, {
    headers: MAPBOX_SERVER_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new MapboxMatrixError(response.status);
  return (await response.json()) as MapboxMatrixData;
}

const fetchStableMatrix = unstable_cache(
  fetchMatrixUncached,
  ["mapbox-radius-matrix-stable-v1"],
  { revalidate: DAY_SECONDS },
);

const fetchTrafficMatrix = unstable_cache(
  fetchMatrixUncached,
  ["mapbox-radius-matrix-traffic-v1"],
  { revalidate: TRAFFIC_CACHE_SECONDS },
);

function numberParam(value: string | null): number {
  return value === null || value.trim() === "" ? Number.NaN : Number(value);
}

export async function GET(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return new Response("Forbidden", { status: 403 });
  }
  // A settled radius sends one debounced request. Thirty per minute leaves
  // generous room for real exploration while containing forged loops.
  if (await isRateLimited(req, "travel-matrix", 30, 60)) {
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
  const cacheSeconds =
    mode === "drive" ? TRAFFIC_CACHE_SECONDS : DAY_SECONDS;
  const staleSeconds = mode === "drive" ? TRAFFIC_CACHE_SECONDS : 604_800;

  try {
    const data = await (mode === "drive"
      ? fetchTrafficMatrix
      : fetchStableMatrix)(
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
    return Response.json(response, {
      headers: {
        "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=${staleSeconds}`,
      },
    });
  } catch (error) {
    if (error instanceof MapboxMatrixError) {
      return Response.json({
        ok: false,
        reason: `upstream-${error.status}`,
      });
    }
    return Response.json({ ok: false, reason: "fetch-error" });
  }
}
