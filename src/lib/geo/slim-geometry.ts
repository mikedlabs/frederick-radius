/**
 * slim-geometry — shrink overlay GeoJSON before it ships to the client.
 *
 * The /map flight payload audit (2026-07-02) found the decorative line
 * layers carrying raw GIS precision straight from their sources: the
 * municipal boundaries alone were 439 KB of 17-digit coordinates
 * ("-77.28908997678191") across 11,472 vertices, transit routes another
 * 247 KB — ~45% of the page's HTML for outlines drawn at county zoom.
 *
 * Two lossy-but-invisible passes, applied server-side in the layer
 * getters (never in the pure normalizers, whose unit tests assert
 * source-shape fidelity):
 *
 *   1. Coordinate rounding. 5 decimals ≈ 1.1 m — far below a hairline
 *      boundary stroke at any zoom the app reaches. Halves the bytes of
 *      every vertex on its own.
 *   2. Douglas-Peucker simplification. Boundaries/routes are drawn, not
 *      measured; a display tolerance drops the vertices a stroke can't
 *      show. Tolerance is in DEGREES (≈ 111 km per degree of latitude;
 *      0.0002 ≈ 22 m).
 *
 * Pure, no deps. Polygon rings stay closed; rings that collapse below
 * 4 points and lines below 2 are dropped. Unknown geometry types pass
 * through untouched.
 */

type Pos = [number, number];

/** Perpendicular distance (degrees) from p to the a→b segment. */
function segDist(p: Pos, a: Pos, b: Pos): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker, iterative (a GIS ring can be deep enough to blow the
 *  call stack with naive recursion). Keeps first + last points. */
export function simplifyLine(points: Pos[], tolerance: number): Pos[] {
  if (tolerance <= 0 || points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop() as [number, number];
    let maxD = 0;
    let maxI = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = segDist(points[i], points[lo], points[hi]);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > tolerance && maxI > 0) {
      keep[maxI] = 1;
      stack.push([lo, maxI], [maxI, hi]);
    }
  }
  const out: Pos[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

function roundPos(p: Pos, factor: number): Pos {
  return [Math.round(p[0] * factor) / factor, Math.round(p[1] * factor) / factor];
}

function isPos(v: unknown): v is Pos {
  return Array.isArray(v) && typeof v[0] === "number" && typeof v[1] === "number";
}

function slimPath(path: unknown, factor: number, tolerance: number, minPoints: number): Pos[] | null {
  if (!Array.isArray(path)) return null;
  const pts: Pos[] = [];
  for (const v of path) if (isPos(v)) pts.push(roundPos(v as Pos, factor));
  const slim = simplifyLine(pts, tolerance);
  return slim.length >= minPoints ? slim : null;
}

export type SlimOptions = {
  /** Coordinate decimals kept (default 5 ≈ 1.1 m). */
  decimals?: number;
  /** Douglas-Peucker tolerance in degrees; 0 skips simplification. */
  tolerance?: number;
};

type AnyFC = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; geometry: unknown; properties: Record<string, unknown> }>;
};

/**
 * Slim every LineString/MultiLineString/Polygon/MultiPolygon in a
 * FeatureCollection. Returns a NEW collection (inputs may be shared with
 * the fetch data cache); features whose geometry collapses are dropped.
 */
export function slimGeometryFC<T extends AnyFC>(fc: T, opts?: SlimOptions): T {
  const decimals = opts?.decimals ?? 5;
  const tolerance = opts?.tolerance ?? 0;
  const factor = 10 ** decimals;
  const features: AnyFC["features"] = [];
  for (const f of fc.features) {
    const g = f?.geometry as { type?: string; coordinates?: unknown } | null;
    const t = g?.type;
    let coords: unknown = null;
    if (t === "LineString") {
      coords = slimPath(g?.coordinates, factor, tolerance, 2);
    } else if (t === "MultiLineString" && Array.isArray(g?.coordinates)) {
      const lines = g.coordinates
        .map((l) => slimPath(l, factor, tolerance, 2))
        .filter((l): l is Pos[] => l !== null);
      coords = lines.length > 0 ? lines : null;
    } else if (t === "Polygon" && Array.isArray(g?.coordinates)) {
      const rings = g.coordinates
        .map((r) => slimPath(r, factor, tolerance, 4))
        .filter((r): r is Pos[] => r !== null)
        .map(closeRing);
      coords = rings.length > 0 ? rings : null;
    } else if (t === "MultiPolygon" && Array.isArray(g?.coordinates)) {
      const polys = g.coordinates
        .map((poly) =>
          Array.isArray(poly)
            ? poly
                .map((r) => slimPath(r, factor, tolerance, 4))
                .filter((r): r is Pos[] => r !== null)
                .map(closeRing)
            : [],
        )
        .filter((poly) => poly.length > 0);
      coords = polys.length > 0 ? polys : null;
    } else {
      features.push(f); // unknown type — pass through untouched
      continue;
    }
    if (coords === null) continue; // geometry collapsed below drawable
    features.push({ ...f, geometry: { type: t, coordinates: coords } });
  }
  return { ...fc, features };
}

/** GeoJSON polygon rings must close (first point === last). Rounding or
 *  simplification can technically leave them open; re-close defensively. */
function closeRing(ring: Pos[]): Pos[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}
