import type { PlaceCardData } from "@/lib/loaders/places";

export type BreweryMapBounds = [[number, number], [number, number]];

type MappablePlace = Pick<
  PlaceCardData,
  "slug" | "name" | "municipality" | "geom"
>;

function isFiniteCoordinate(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * The brewery map is a county guide, not a downtown map with a few distant
 * pins. Derive its opening frame from the records it actually renders so a
 * new brewery can never land outside a hard-coded camera.
 */
export function breweryMapBounds(
  places: readonly MappablePlace[],
): BreweryMapBounds | null {
  const coordinates = places
    .map((place) => place.geom)
    .filter(
      (geom) =>
        isFiniteCoordinate(geom.lng) && isFiniteCoordinate(geom.lat),
    );

  if (coordinates.length === 0) return null;

  const lngs = coordinates.map((geom) => geom.lng);
  const lats = coordinates.map((geom) => geom.lat);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const south = Math.min(...lats);
  const north = Math.max(...lats);

  // Mapbox cannot fit a zero-area box. A single future taproom still gets a
  // useful neighborhood frame instead of an invalid camera.
  const lngPad = west === east ? 0.015 : 0;
  const latPad = south === north ? 0.012 : 0;

  return [
    [west - lngPad, south - latPad],
    [east + lngPad, north + latPad],
  ];
}

export type BreweryTownCount = {
  municipality: string;
  count: number;
};

/** Compact map legend ordered by coverage, then by town name. */
export function breweryTownCounts(
  places: readonly MappablePlace[],
): BreweryTownCount[] {
  const counts = new Map<string, number>();
  for (const place of places) {
    counts.set(
      place.municipality,
      (counts.get(place.municipality) ?? 0) + 1,
    );
  }

  return [...counts.entries()]
    .map(([municipality, count]) => ({ municipality, count }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.municipality.localeCompare(b.municipality),
    );
}

