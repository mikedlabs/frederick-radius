export type ReachBoundaryStatus = "loading" | "street" | "distance";

export type ReachPolygons = number[][][];

/**
 * Flatten a Mapbox Isochrone FeatureCollection into outer polygon rings.
 * Both Polygon and MultiPolygon responses are valid.
 */
export function collectReachPolygons(
  fc: GeoJSON.FeatureCollection,
): ReachPolygons {
  const out: ReachPolygons = [];
  for (const feature of fc.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "Polygon") {
      if (geometry.coordinates[0]) {
        out.push(geometry.coordinates[0] as number[][]);
      }
    } else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates) {
        if (polygon[0]) out.push(polygon[0] as number[][]);
      }
    }
  }
  return out;
}

/**
 * Ray-casting point-in-polygon test for [longitude, latitude].
 */
export function pointInReachPolygon(
  point: [number, number],
  ring: number[][],
): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInAnyReachPolygon(
  point: [number, number],
  polygons: ReachPolygons,
): boolean {
  return polygons.some((ring) => pointInReachPolygon(point, ring));
}

/**
 * One reach rule for places, events, and amenities.
 *
 * A loaded Mapbox boundary wins even when the point's straight-line
 * distance would fit the fallback circle. Until that boundary is available,
 * distance keeps the experience useful without pretending it is routed.
 */
export function isPointWithinReach({
  point,
  distanceMeters,
  maxDistanceMeters,
  polygons,
}: {
  point: [number, number];
  distanceMeters: number;
  maxDistanceMeters: number;
  polygons: ReachPolygons | null;
}): boolean {
  if (polygons && polygons.length > 0) {
    return pointInAnyReachPolygon(point, polygons);
  }
  return distanceMeters <= maxDistanceMeters;
}
