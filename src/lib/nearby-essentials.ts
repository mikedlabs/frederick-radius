import type { Amenity, AmenityKind } from "@/lib/loaders/amenities";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";

export type EssentialNeedId =
  | "restroom"
  | "water"
  | "trash"
  | "dog-bags"
  | "seating"
  | "power";

export type EssentialNeed = {
  id: EssentialNeedId;
  label: string;
  resultLabel: string;
  kinds: AmenityKind[];
  mapGroup: string;
};

/** Six time-sensitive jobs, written in the language someone uses while out.
 * The map can expose the full amenity catalog; this list stays intentionally
 * short so the urgent path never turns back into a directory. */
export const ESSENTIAL_NEEDS: EssentialNeed[] = [
  {
    id: "restroom",
    label: "Restroom",
    resultLabel: "restroom",
    kinds: ["restroom"],
    mapGroup: "restroom",
  },
  {
    id: "water",
    label: "Water",
    resultLabel: "water point",
    kinds: ["water"],
    mapGroup: "water",
  },
  {
    id: "trash",
    label: "Trash",
    resultLabel: "trash can",
    kinds: ["trash"],
    mapGroup: "trash",
  },
  {
    id: "dog-bags",
    label: "Dog bags",
    resultLabel: "dog-bag station",
    kinds: ["dog_waste"],
    mapGroup: "dog",
  },
  {
    id: "seating",
    label: "Seating",
    resultLabel: "public seat",
    kinds: ["bench"],
    mapGroup: "seating",
  },
  {
    id: "power",
    label: "Power",
    resultLabel: "public outlet",
    kinds: ["outlet"],
    mapGroup: "outlet",
  },
];

export type RankedEssential = {
  point: Amenity;
  distanceM: number;
};

/** Beyond two miles the answer is still the nearest known point, but it is
 * not a credible "nearby" walking result. Callers should disclose that
 * difference instead of presenting a distant county result as convenient. */
export const ESSENTIAL_NEARBY_MAX_M = 3_218.688;

export function essentialNeed(id: string | null | undefined): EssentialNeed | null {
  return ESSENTIAL_NEEDS.find((need) => need.id === id) ?? null;
}

export function nearestEssential(
  origin: LngLat,
  points: Amenity[],
  need: EssentialNeed,
): RankedEssential | null {
  let nearest: RankedEssential | null = null;
  const kinds = new Set(need.kinds);

  for (const point of points) {
    if (!kinds.has(point.kind)) continue;
    const distanceM = haversineMeters(origin, point);
    if (
      nearest === null ||
      distanceM < nearest.distanceM ||
      (distanceM === nearest.distanceM && point.id.localeCompare(nearest.point.id) < 0)
    ) {
      nearest = { point, distanceM };
    }
  }

  return nearest;
}

export function essentialDistanceLabel(distanceM: number): string {
  return formatDistance(distanceM);
}

export function isEssentialNearby(distanceM: number): boolean {
  return distanceM <= ESSENTIAL_NEARBY_MAX_M;
}

export function essentialMapHref(
  need: EssentialNeed,
  point?: Pick<Amenity, "lat" | "lng">,
): string {
  const params = new URLSearchParams({ amenity: need.mapGroup });
  if (point) params.set("at", `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`);
  return `/map?${params.toString()}`;
}

export function essentialDirectionsHref(point: Pick<Amenity, "lat" | "lng">): string {
  const apple =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  if (apple) {
    const params = new URLSearchParams({
      daddr: `${point.lat},${point.lng}`,
      dirflg: "w",
    });
    return `https://maps.apple.com/?${params.toString()}`;
  }
  const params = new URLSearchParams({
    api: "1",
    travelmode: "walking",
    destination: `${point.lat},${point.lng}`,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
