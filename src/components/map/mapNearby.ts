import { haversineMeters, type LngLat } from "@/lib/geo";

export type NearbyUtilityPoint = LngLat & { kind: string };
export type NearbyUtility = { label: string; distM: number };

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
