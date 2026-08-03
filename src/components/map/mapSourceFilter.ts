/**
 * The curated GeoJSON source must describe the same result set as the active
 * map filter. Styling nonmatches as faint pins is not sufficient because
 * Mapbox clusters before it paints: a faded restaurant would still inflate a
 * Coffee cluster count. A null match set means no place filter is active and
 * preserves the full browse map; an empty set means an active filter has no
 * matches and therefore produces an empty curated source.
 */
export function curatedPlacesForMapSource<T extends { slug: string }>(
  places: T[],
  matchSlugs: ReadonlySet<string> | null,
): T[] {
  if (matchSlugs === null) return places;
  return places.filter((place) => matchSlugs.has(place.slug));
}

/**
 * Trusted OSM context is useful on the unfiltered county map, but it has no
 * one-to-one relationship with Radius intent slugs. Keeping it visible during
 * a Coffee/Open-now/etc. filter makes the active summary describe only part of
 * the screen. Hide that secondary source until the place filter is cleared.
 */
export function backgroundPlacesForMapSource<T>(
  places: T[],
  hasActivePlaceFilter: boolean,
): T[] {
  return hasActivePlaceFilter ? [] : places;
}
