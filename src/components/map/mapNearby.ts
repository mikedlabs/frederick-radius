import { haversineMeters, type LngLat } from "@/lib/geo";

export type NearbyUtilityPoint = LngLat & { kind: string };
export type NearbyUtility = { label: string; distM: number };
export type NearestUtilityPoint<T extends NearbyUtilityPoint> = {
  point: T;
  distM: number;
};

const LABEL_BY_KIND: Record<string, string> = {
  restroom: "Restroom",
  water: "Water",
  trash: "Trash",
  recycling: "Recycling",
  bench: "Seating",
  picnic: "Picnic table",
  "dog-waste": "Dog station",
  "dog-water": "Dog water",
  wifi: "Wi-Fi",
  outlet: "Power",
  "bike-parking": "Bike parking",
  "bike-repair": "Bike repair",
  "ev-charging": "EV charger",
  playground: "Playground",
  transit: "Transit stop",
};

/**
 * The small, decision-useful join shown on a place peek. It deliberately
 * keeps one result per utility kind: "Restroom · 300 ft" is helpful;
 * three nearby benches are map noise. Unknown categories stay off the line.
 */
export function nearestMapUtilities(
  origin: LngLat,
  points: NearbyUtilityPoint[],
  maxDistanceM = 650,
  limit = 3,
): NearbyUtility[] {
  const nearestByLabel = new Map<string, number>();

  for (const point of points) {
    const label = LABEL_BY_KIND[point.kind];
    if (!label) continue;
    const distM = haversineMeters(origin, point);
    if (distM > maxDistanceM) continue;
    const previous = nearestByLabel.get(label);
    if (previous == null || distM < previous) nearestByLabel.set(label, distM);
  }

  return [...nearestByLabel]
    .map(([label, distM]) => ({ label, distM }))
    .sort((a, b) => a.distM - b.distM || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/**
 * Return the actual nearest mapped point for a chosen utility group. This is
 * the decision counterpart to the small summary above: the map can open one
 * named result with distance and Directions instead of making a person hunt
 * through a countywide set of pins.
 */
export function nearestMapUtilityPoint<T extends NearbyUtilityPoint>(
  origin: LngLat,
  points: T[],
  allowedKinds: ReadonlySet<string>,
): NearestUtilityPoint<T> | null {
  let nearest: NearestUtilityPoint<T> | null = null;

  for (const point of points) {
    if (!allowedKinds.has(point.kind)) continue;
    const distM = haversineMeters(origin, point);
    if (nearest === null || distM < nearest.distM) {
      nearest = { point, distM };
    }
  }

  return nearest;
}
