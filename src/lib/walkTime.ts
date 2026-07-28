/**
 * Pure helpers for the real-walk-time upgrade on the map's directions
 * chip (AppMap) and its API route (/api/walk-time).
 *
 * The chip renders a straight-line estimate instantly ("~4 min walk",
 * WALKING_MPS in src/lib/geo.ts) and swaps in routed minutes from the
 * Mapbox Directions API when they arrive. These helpers hold the two
 * decisions both sides must agree on:
 *
 *  1. WHEN to ask the API at all (the chip only shows a walk figure in
 *     walkable range; beyond a sanity radius the estimate stands), and
 *  2. HOW to round the origin so nearby users share one cache entry
 *     and we never put a precise user location in a URL or cache key, and
 *  3. HOW to compact optional routed geometry before it crosses the API
 *     boundary.
 *
 * Kept pure (no data imports, type-only geo import) so it is safe in
 * the client bundle and trivially spec-able.
 */
import type { LngLat } from "@/lib/geo";

export type WalkRouteCoordinate = [lng: number, lat: number];
export type WalkRouteCoordinates = WalkRouteCoordinate[];

export type WalkTimeSuccess = {
  ok: true;
  minutes: number;
  meters: number | null;
  /** Present only when the caller opts into geometry and Mapbox returns it. */
  coordinates?: WalkRouteCoordinates;
};

export type WalkTimeFailure = {
  ok: false;
  reason: string;
};

export type WalkTimeResponse = WalkTimeSuccess | WalkTimeFailure;

export type WalkTimeQueryOptions = {
  /** Ask the API for a simplified routed LineString coordinate array. */
  geometry?: boolean;
};

/**
 * The map chip's "honest mode" threshold: under this straight-line
 * distance the ETA reads as a walk, beyond it as a drive ("~1 min
 * drive" for a place 300m away read as parody). Must match the mode
 * pick in AppMap's routeInfo — it imports this constant.
 */
export const WALK_LABEL_MAX_METERS = 800;

/**
 * Sanity radius for the Directions API: past ~2.5km straight-line
 * nobody is walking and the routed number would never render anyway,
 * so don't spend a metered call on it.
 */
export const WALK_TIME_MAX_METERS = 2500;

/** Defensive payload ceiling. An 800m simplified walking route is normally
 * far smaller, but a malformed or unexpectedly detailed upstream response
 * must not turn this tiny API into a multi-thousand-point download. */
export const WALK_ROUTE_MAX_POINTS = 256;

const WALK_ROUTE_COORD_DECIMALS = 5;

/**
 * Should the client ask /api/walk-time for this selection? Only when
 * the chip will actually show a walk figure (walkable range) and the
 * destination is within the sanity radius. NaN/zero/negative distances
 * (bad fix, self-distance) fail closed — the estimate stands.
 */
export function shouldFetchWalkTime(straightLineMeters: number): boolean {
  return (
    Number.isFinite(straightLineMeters) &&
    straightLineMeters > 0 &&
    straightLineMeters <= Math.min(WALK_LABEL_MAX_METERS, WALK_TIME_MAX_METERS)
  );
}

/**
 * Round a coordinate to 3 decimal places (~110m of latitude, ~85m of
 * longitude at Frederick). Applied to the ORIGIN only: it snaps nearby
 * users onto one cache key (edge cache + Mapbox billing both win) and
 * keeps a precise user location out of URLs, caches, and logs. A
 * ~100m origin snap moves a walk time by under a minute and a half —
 * inside the honesty budget of a walking ETA.
 */
export function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundRouteCoord(value: number): number {
  const scale = 10 ** WALK_ROUTE_COORD_DECIMALS;
  return Math.round(value * scale) / scale;
}

/**
 * Sanitize Mapbox's optional GeoJSON LineString coordinates for the public
 * response. Invalid positions are dropped, consecutive duplicate points are
 * collapsed after rounding, and unusually large lines are sampled evenly
 * while retaining both endpoints.
 */
export function normalizeWalkRouteCoordinates(
  raw: unknown,
): WalkRouteCoordinates | undefined {
  if (!Array.isArray(raw)) return undefined;

  const points: WalkRouteCoordinates = [];
  for (const position of raw) {
    if (!Array.isArray(position) || position.length < 2) continue;
    const lng = position[0];
    const lat = position[1];
    if (
      typeof lng !== "number" ||
      typeof lat !== "number" ||
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      lng < -180 ||
      lng > 180 ||
      lat < -90 ||
      lat > 90
    ) {
      continue;
    }
    const point: WalkRouteCoordinate = [
      roundRouteCoord(lng),
      roundRouteCoord(lat),
    ];
    const previous = points.at(-1);
    if (previous?.[0] === point[0] && previous[1] === point[1]) continue;
    points.push(point);
  }

  if (points.length < 2) return undefined;
  if (points.length <= WALK_ROUTE_MAX_POINTS) return points;

  const sampled: WalkRouteCoordinates = [points[0]];
  const step = (points.length - 1) / (WALK_ROUTE_MAX_POINTS - 1);
  for (let index = 1; index < WALK_ROUTE_MAX_POINTS - 1; index += 1) {
    sampled.push(points[Math.round(index * step)]);
  }
  sampled.push(points.at(-1)!);
  return sampled;
}

/**
 * Query string for /api/walk-time. Origin is rounded here, client-side,
 * so the request URL itself is the shared cache key; the destination is
 * a public place coordinate and stays exact.
 */
export function walkTimeQuery(
  origin: LngLat,
  dest: LngLat,
  options: WalkTimeQueryOptions = {},
): string {
  const params = new URLSearchParams({
    olng: String(roundCoord(origin.lng)),
    olat: String(roundCoord(origin.lat)),
    dlng: String(dest.lng),
    dlat: String(dest.lat),
  });
  if (options.geometry) params.set("geometry", "1");
  return params.toString();
}
