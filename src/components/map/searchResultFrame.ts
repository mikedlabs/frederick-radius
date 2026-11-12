import type { LngLat } from "@/lib/geo";
import { FREDERICK_COUNTY_BOUNDS } from "./constants";

export type SearchResultFrame =
  | { kind: "point"; center: [number, number] }
  | { kind: "bounds"; bounds: [[number, number], [number, number]] };

/** How many ranked results decide the frame. One far outlier at the end of
 * the list must not pull the camera back out to the whole county. */
export const SEARCH_FRAME_RESULT_LIMIT = 12;

/** Results that already cover most of the county keep the county frame. */
const COUNTY_SPREAD_SHARE = 0.7;

/**
 * The camera frame for a submitted search, or null when the camera should
 * stay where it is. Pure, so the rule is testable without a renderer.
 *
 * The November 11, 2026 hierarchy audit found that a category search left the
 * map at county zoom with its results as small pins. Framing happens once per
 * submitted search, never on a filter chip toggle, which is the camera jump
 * the retired auto-fit caused.
 */
export function searchResultFrame(
  rankedPoints: readonly LngLat[],
  limit = SEARCH_FRAME_RESULT_LIMIT,
): SearchResultFrame | null {
  const points = rankedPoints
    .filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat))
    .slice(0, Math.max(1, limit));
  if (points.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const { lng, lat } of points) {
    w = Math.min(w, lng);
    e = Math.max(e, lng);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  if (w === e && s === n) return { kind: "point", center: [w, s] };
  const [[countyW, countyS], [countyE, countyN]] = FREDERICK_COUNTY_BOUNDS;
  const spreadsCounty =
    e - w >= (countyE - countyW) * COUNTY_SPREAD_SHARE &&
    n - s >= (countyN - countyS) * COUNTY_SPREAD_SHARE;
  if (spreadsCounty) return null;
  return { kind: "bounds", bounds: [[w, s], [e, n]] };
}
