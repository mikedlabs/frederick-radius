import { formatDistance } from "@/lib/geo";

/**
 * What a map distance is measured from. Every distance the map prints says
 * so, because a bare "0.4 mi" could mean from you, from the map center or
 * from a selected place (November 11, 2026 hierarchy audit). The wording
 * matches the area vocabulary: "from you" pairs with "Near me".
 */
export type MapDistanceOriginLabel = "from you" | "from map center";

/** The origin label for a list that ranks from the device fix when there is
 * one and from the map center otherwise. */
export function mapDistanceOriginLabel(hasDeviceFix: boolean): MapDistanceOriginLabel {
  return hasDeviceFix ? "from you" : "from map center";
}

/** "0.4 mi from you". */
export function distanceFrom(meters: number, origin: MapDistanceOriginLabel): string {
  return `${formatDistance(meters)} ${origin}`;
}
