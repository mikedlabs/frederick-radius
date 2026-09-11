export type MapPlaceVisualState = {
  dimmed: boolean;
  emph: boolean;
};

/** One visual truth for map filters. An explicit amenity task recedes business
 * pins; a place match highlights only the requested set; a clean map is calm. */
export function mapPlaceVisualState(
  slug: string,
  options: {
    amenitiesActive: boolean;
    sceneFocusActive?: boolean;
    matchSlugs: ReadonlySet<string> | null;
  },
): MapPlaceVisualState {
  const matches = options.matchSlugs?.has(slug) ?? false;
  return {
    dimmed:
      options.amenitiesActive ||
      options.sceneFocusActive === true ||
      (options.matchSlugs ? !matches : false),
    emph:
      !options.amenitiesActive &&
      !options.sceneFocusActive &&
      Boolean(options.matchSlugs) &&
      matches,
  };
}

export function mapPaintTransitionDuration(reducedMotion: boolean): number {
  return reducedMotion ? 0 : 180;
}
