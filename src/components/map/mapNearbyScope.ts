import { haversineMeters, type LngLat } from "@/lib/geo";

export type LocatedMapItem = {
  geom: LngLat;
};

/**
 * Near me means the one-mile Radius drawn on the map, not the whole county.
 * The viewport may narrow the result further, but can never expand this set.
 */
export function placesWithinReach<T extends LocatedMapItem>(
  places: readonly T[],
  origin: LngLat,
  radiusMeters: number,
): T[] {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return [];
  return places.filter(
    (place) => haversineMeters(origin, place.geom) <= radiusMeters,
  );
}

/** Bounds for the same honest reach circle, suitable for Mapbox fitBounds. */
export function nearbyReachBounds(
  origin: LngLat,
  radiusMeters: number,
): [[number, number], [number, number]] {
  const safeRadius = Math.max(1, radiusMeters);
  const latitudeDelta = safeRadius / 111_320;
  const longitudeScale = Math.max(
    0.1,
    Math.cos((origin.lat * Math.PI) / 180),
  );
  const longitudeDelta = safeRadius / (111_320 * longitudeScale);
  return [
    [origin.lng - longitudeDelta, origin.lat - latitudeDelta],
    [origin.lng + longitudeDelta, origin.lat + latitudeDelta],
  ];
}
