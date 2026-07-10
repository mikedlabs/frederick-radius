import TRANSIT from "@/data/transit.json";

/**
 * routeGeometry — pure 1-D arithmetic for the string-of-pearls board.
 *
 * The board flattens each route's 2-D polyline (TRANSIT.shapes, GTFS static)
 * into a single horizontal line: every position along the route becomes a
 * FRACTION of its total arc length. Two questions get answered here:
 *
 *   1. Where do the stops sit on that line? (`pearlsFor`) — each stop from
 *      the static stop table is projected onto the route's shape
 *      (nearest-segment); stops that land within ~44 m of the polyline are
 *      kept and ordered by arc length. transit.json has no per-route
 *      stop_times, so proximity to the published shape IS the membership
 *      test — good enough for a diagram whose beads are context, not truth.
 *   2. Where is the bus on that line? (`fractionAlong`) — the live fix,
 *      projected the same way.
 *
 * Distances are lat-corrected planar degrees (same convention as the map's
 * LiveBuses glide): cheap, and only ever compared to other small local
 * distances, so true meters are never needed.
 */

export type Pt = { lat: number; lng: number };
export type Shape = { pts: Pt[]; cum: number[]; total: number };

const D2R = Math.PI / 180;

export function planarDist(a: Pt, b: Pt): number {
  const k = Math.cos(((a.lat + b.lat) / 2) * D2R);
  const dx = (b.lng - a.lng) * k;
  const dy = b.lat - a.lat;
  return Math.sqrt(dx * dx + dy * dy);
}

export function buildShape(raw: number[][]): Shape {
  const pts: Pt[] = raw
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map((p) => ({ lat: p[0], lng: p[1] }));
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + planarDist(pts[i - 1], pts[i]);
  return { pts, cum, total: cum[cum.length - 1] ?? 0 };
}

/** Nearest point on the polyline: arc-length `s` + perpendicular distance `d`. */
export function projectToShape(shape: Shape, p: Pt): { s: number; d: number } {
  let bestD = Infinity;
  let bestS = 0;
  for (let i = 0; i < shape.pts.length - 1; i++) {
    const a = shape.pts[i];
    const b = shape.pts[i + 1];
    const k = Math.cos(((a.lat + b.lat) / 2) * D2R);
    const ax = a.lng * k, ay = a.lat;
    const vx = b.lng * k - ax, vy = b.lat - ay;
    const wx = p.lng * k - ax, wy = p.lat - ay;
    const len2 = vx * vx + vy * vy;
    let t = len2 === 0 ? 0 : (wx * vx + wy * vy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + t * vx, cy = ay + t * vy;
    const dd = Math.hypot(p.lng * k - cx, p.lat - cy);
    if (dd < bestD) {
      bestD = dd;
      bestS = shape.cum[i] + t * (shape.cum[i + 1] - shape.cum[i]);
    }
  }
  return { s: bestS, d: bestD };
}

const SHAPE_BY_ROUTE: Record<string, Shape> = Object.fromEntries(
  Object.entries(TRANSIT.shapes as Record<string, number[][]>).map(([id, raw]) => [id, buildShape(raw)]),
);

/** A stop bead on the flattened route line. `frac` is 0..1 along the arc. */
export type Pearl = { id: string; name: string; frac: number };

type TransitStopRow = { id: string; name: string; lat: number; lng: number };
const STOPS = TRANSIT.stops as TransitStopRow[];

// A stop counts as "on this route" within ~44 m of the polyline — tight
// enough that a parallel street's stops don't leak in, loose enough for
// normal GPS/shape offset. Measured against the real data: 16–65 stops per
// route at this threshold, which matches the published network.
const STOP_ON_ROUTE = 0.0004;

// More beads than this and the line reads as noise at 390 px, so thin the
// sequence evenly (keeping both ends). The beads are texture — the diagram's
// truth is the live dot's position, which is never thinned.
const MAX_PEARLS = 24;

// Beads closer together than this fraction of the line merge into one —
// paired curb stops aren't two beads at diagram scale.
const MIN_PEARL_GAP = 0.012;

const pearlCache = new Map<string, Pearl[]>();
const seqCache = new Map<string, Pearl[]>();

/**
 * The route's FULL stop sequence (paired curb stops collapsed), ordered by
 * arc length — the un-thinned truth behind the beads. The scrub readout
 * reads names from this, so a finger between two drawn beads still names
 * the real stop there. Cached per route.
 */
export function stopSequenceFor(routeId: string): Pearl[] {
  const hit = seqCache.get(routeId);
  if (hit) return hit;
  const shape = SHAPE_BY_ROUTE[routeId];
  let out: Pearl[] = [];
  if (shape && shape.total > 0) {
    const seq: Pearl[] = [];
    for (const s of STOPS) {
      const pr = projectToShape(shape, { lat: s.lat, lng: s.lng });
      if (pr.d <= STOP_ON_ROUTE) seq.push({ id: s.id, name: s.name, frac: pr.s / shape.total });
    }
    seq.sort((a, b) => a.frac - b.frac);
    // Paired stops (the two sides of the same street) project to nearly the
    // same arc position and render as a doubled bead — collapse anything
    // closer than ~1.2% of the line to the bead before it.
    const spaced: Pearl[] = [];
    for (const p of seq) {
      const prev = spaced[spaced.length - 1];
      if (!prev || p.frac - prev.frac >= MIN_PEARL_GAP) spaced.push(p);
    }
    out = spaced;
  }
  seqCache.set(routeId, out);
  return out;
}

/** The route's stop sequence as evenly thinned beads, ordered by arc length.
 *  Empty array when the route has no usable shape. Cached per route. */
export function pearlsFor(routeId: string): Pearl[] {
  const hit = pearlCache.get(routeId);
  if (hit) return hit;
  const seqSpaced = stopSequenceFor(routeId);
  let out: Pearl[] = seqSpaced;
  if (seqSpaced.length > MAX_PEARLS) {
    const step = (seqSpaced.length - 1) / (MAX_PEARLS - 1);
    const thinned: Pearl[] = [];
    for (let i = 0; i < MAX_PEARLS; i++) thinned.push(seqSpaced[Math.round(i * step)]);
    out = thinned;
  }
  pearlCache.set(routeId, out);
  return out;
}

/** The live fix's position along the route line, 0..1. Null when the route
 *  has no usable shape (the bus can't be placed on a diagram). */
export function fractionAlong(routeId: string, p: Pt): number | null {
  const shape = SHAPE_BY_ROUTE[routeId];
  if (!shape || shape.total <= 0) return null;
  const pr = projectToShape(shape, p);
  return Math.min(1, Math.max(0, pr.s / shape.total));
}
