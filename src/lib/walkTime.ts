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
 *     and we never put a precise user location in a URL or cache key.
 *
 * Kept pure (no data imports, type-only geo import) so it is safe in
 * the client bundle and trivially spec-able.
 */
import type { LngLat } from "@/lib/geo";

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

/**
 * Query string for /api/walk-time. Origin is rounded here, client-side,
 * so the request URL itself is the shared cache key; the destination is
 * a public place coordinate and stays exact.
 */
export function walkTimeQuery(origin: LngLat, dest: LngLat): string {
  return new URLSearchParams({
    olng: String(roundCoord(origin.lng)),
    olat: String(roundCoord(origin.lat)),
    dlng: String(dest.lng),
    dlat: String(dest.lat),
  }).toString();
}
