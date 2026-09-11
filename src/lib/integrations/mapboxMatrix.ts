import "server-only";

import { isValidCoord, type LngLat } from "@/lib/geo";
import {
  MAPBOX_SERVER_HEADERS,
  MAPBOX_SERVER_TOKEN,
} from "@/lib/mapbox-server";
import {
  mapboxDailyUsageCap,
  mapboxMatrixRuntimeEnabled,
} from "@/lib/mapbox-budget";
import { reserveDailyUsage } from "@/lib/usage-meter";
import { roundCoord } from "@/lib/walkTime";

/**
 * One origin plus nine destinations keeps every Matrix request within the
 * 10-coordinate limit of Mapbox's driving-traffic profile. The API bills by
 * source × destination elements, so this service always requests a 1×N
 * asymmetric matrix rather than Mapbox's much more expensive N×N default.
 */
export const MAPBOX_MATRIX_MAX_DESTINATIONS = 9;
export const MAPBOX_MATRIX_MIN_DESTINATIONS = 2;

const MATRIX_TIMEOUT_MS = 5_500;

export const MAPBOX_MATRIX_PROFILES = [
  "walking",
  "cycling",
  "driving",
  "driving-traffic",
] as const;

export type MapboxMatrixProfile = (typeof MAPBOX_MATRIX_PROFILES)[number];

export type MapboxMatrixInput = {
  profile: MapboxMatrixProfile;
  origin: LngLat;
  destinations: LngLat[];
};

export type MapboxMatrixLeg = {
  destinationIndex: number;
  destination: LngLat;
  reachable: boolean;
  durationSeconds: number | null;
  minutes: number | null;
  distanceMeters: number | null;
};

export type MapboxMatrixSuccess = {
  ok: true;
  profile: MapboxMatrixProfile;
  origin: LngLat;
  legs: MapboxMatrixLeg[];
};

export type MapboxMatrixFailureReason =
  | "invalid-body"
  | "bad-profile"
  | "bad-origin"
  | "out-of-county-origin"
  | "bad-destinations"
  | "too-few-destinations"
  | "too-many-destinations"
  | "bad-destination"
  | "out-of-county-destination"
  | "disabled"
  | "no-token"
  | "upstream-timeout"
  | "upstream-network"
  | "cost-control-unavailable"
  | "daily-cap-reached"
  | `upstream-${number}`
  | "no-route"
  | "invalid-upstream-response";

export type MapboxMatrixFailure = {
  ok: false;
  reason: MapboxMatrixFailureReason;
  /** True only when retrying later could reasonably succeed. */
  retryable: boolean;
};

export type MapboxMatrixResponse =
  | MapboxMatrixSuccess
  | MapboxMatrixFailure;

export type MapboxMatrixValidation =
  | { ok: true; value: MapboxMatrixInput }
  | { ok: false; reason: MapboxMatrixFailureReason };

const PROFILE_PATHS: Record<MapboxMatrixProfile, string> = {
  walking: "mapbox/walking",
  cycling: "mapbox/cycling",
  driving: "mapbox/driving",
  "driving-traffic": "mapbox/driving-traffic",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCoord(
  value: unknown,
  kind: "origin" | "destination",
): { ok: true; value: LngLat } | { ok: false; reason: MapboxMatrixFailureReason } {
  if (!isRecord(value)) {
    return {
      ok: false,
      reason: kind === "origin" ? "bad-origin" : "bad-destination",
    };
  }

  const lng = value.lng;
  const lat = value.lat;
  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat)
  ) {
    return {
      ok: false,
      reason: kind === "origin" ? "bad-origin" : "bad-destination",
    };
  }

  if (!isValidCoord({ lng, lat })) {
    return {
      ok: false,
      reason:
        kind === "origin"
          ? "out-of-county-origin"
          : "out-of-county-destination",
    };
  }

  // Snap every coordinate to Radius's established ~100 m privacy grid before
  // it reaches Mapbox, a URL, or a server log. Unlike an inferred network
  // location, every origin here was explicitly supplied by the caller.
  const rounded = { lng: roundCoord(lng), lat: roundCoord(lat) };
  if (!isValidCoord(rounded)) {
    return {
      ok: false,
      reason:
        kind === "origin"
          ? "out-of-county-origin"
          : "out-of-county-destination",
    };
  }
  return { ok: true, value: rounded };
}

/**
 * Validate and privacy-normalize an API body or a server caller's unknown
 * input. The Mapbox Matrix API requires at least two elements, hence the
 * two-destination floor for our fixed one-origin request.
 */
export function normalizeMapboxMatrixInput(
  input: unknown,
): MapboxMatrixValidation {
  if (!isRecord(input)) return { ok: false, reason: "invalid-body" };
  if (
    typeof input.profile !== "string" ||
    !MAPBOX_MATRIX_PROFILES.includes(input.profile as MapboxMatrixProfile)
  ) {
    return { ok: false, reason: "bad-profile" };
  }

  const origin = parseCoord(input.origin, "origin");
  if (!origin.ok) return origin;

  if (!Array.isArray(input.destinations)) {
    return { ok: false, reason: "bad-destinations" };
  }
  if (input.destinations.length < MAPBOX_MATRIX_MIN_DESTINATIONS) {
    return { ok: false, reason: "too-few-destinations" };
  }
  if (input.destinations.length > MAPBOX_MATRIX_MAX_DESTINATIONS) {
    return { ok: false, reason: "too-many-destinations" };
  }

  const destinations: LngLat[] = [];
  for (const candidate of input.destinations) {
    const parsed = parseCoord(candidate, "destination");
    if (!parsed.ok) return parsed;
    destinations.push(parsed.value);
  }

  return {
    ok: true,
    value: {
      profile: input.profile as MapboxMatrixProfile,
      origin: origin.value,
      destinations,
    },
  };
}

function fail(
  reason: MapboxMatrixFailureReason,
  retryable = false,
): MapboxMatrixFailure {
  return { ok: false, reason, retryable };
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/**
 * Request a one-to-many Mapbox travel matrix.
 *
 * This function is intentionally fail-soft: validation, configuration,
 * upstream, and response-shape problems are returned as structured failures
 * so Today, Ask, and Map can retain their non-routed fallback ranking.
 *
 * Mapbox's Matrix docs do not publish a reusable-response cache allowance.
 * Until the account contract says otherwise, both the upstream fetch and the
 * public API response remain no-store.
 */
export async function getMapboxTravelMatrix(
  rawInput: unknown,
  options: { timeoutMs?: number } = {},
): Promise<MapboxMatrixResponse> {
  const normalized = normalizeMapboxMatrixInput(rawInput);
  if (!normalized.ok) return fail(normalized.reason);
  if (!mapboxMatrixRuntimeEnabled()) return fail("disabled");
  if (!MAPBOX_SERVER_TOKEN) return fail("no-token");

  const { profile, origin, destinations } = normalized.value;
  const dailyElementCap = mapboxDailyUsageCap("matrix_element");
  const coords = [origin, ...destinations]
    .map(({ lng, lat }) => `${lng},${lat}`)
    .join(";");
  const destinationIndexes = destinations
    .map((_, index) => String(index + 1))
    .join(";");
  const upstream =
    `https://api.mapbox.com/directions-matrix/v1/${PROFILE_PATHS[profile]}/${coords}` +
    `?sources=0&destinations=${destinationIndexes}` +
    `&annotations=duration,distance&access_token=${MAPBOX_SERVER_TOKEN}`;

  try {
    // Matrix is billed per returned element, not per HTTP request.
    const reservation = await reserveDailyUsage(
      "mapbox_matrix",
      dailyElementCap,
      destinations.length,
    );
    if (!reservation) return fail("cost-control-unavailable", true);
    if (!reservation.reserved) return fail("daily-cap-reached");
    const response = await fetch(upstream, {
      headers: MAPBOX_SERVER_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(
        Math.max(
          350,
          Math.min(MATRIX_TIMEOUT_MS, options.timeoutMs ?? MATRIX_TIMEOUT_MS),
        ),
      ),
    });
    if (!response.ok) {
      return fail(
        `upstream-${response.status}`,
        response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      );
    }

    let data: {
      code?: unknown;
      durations?: unknown;
      distances?: unknown;
    };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      return fail("invalid-upstream-response", true);
    }
    if (data.code === "NoRoute") return fail("no-route");
    if (
      data.code !== "Ok" ||
      !Array.isArray(data.durations) ||
      !Array.isArray(data.distances) ||
      !Array.isArray(data.durations[0]) ||
      !Array.isArray(data.distances[0]) ||
      data.durations[0].length < destinations.length ||
      data.distances[0].length < destinations.length
    ) {
      return fail("invalid-upstream-response", true);
    }

    const durationRow = data.durations[0];
    const distanceRow = data.distances[0];
    const legs = destinations.map((destination, destinationIndex) => {
      const durationSeconds = nonNegativeNumber(durationRow[destinationIndex]);
      const distanceMeters = nonNegativeNumber(distanceRow[destinationIndex]);
      return {
        destinationIndex,
        destination,
        reachable: durationSeconds !== null,
        durationSeconds,
        minutes:
          durationSeconds === null
            ? null
            : durationSeconds === 0
              ? 0
              : Math.max(1, Math.round(durationSeconds / 60)),
        distanceMeters:
          distanceMeters === null ? null : Math.round(distanceMeters),
      };
    });

    return { ok: true, profile, origin, legs };
  } catch (error) {
    return isTimeoutError(error)
      ? fail("upstream-timeout", true)
      : fail("upstream-network", true);
  }
}
