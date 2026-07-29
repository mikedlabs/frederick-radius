export type MapViewportBounds = {
  west: number;
  east: number;
  south: number;
  north: number;
};

export type MapResultViewport = {
  center: {
    lng: number;
    lat: number;
  };
  zoom: number;
  bounds: MapViewportBounds;
};

/**
 * Ignore sub-pixel camera settling, but treat a real pan or zoom as a new
 * result area. The center threshold is relative to the committed viewport, so
 * the contract behaves consistently at county and street scale.
 */
export function resultViewportChanged(
  committed: MapResultViewport | null,
  candidate: MapResultViewport,
): boolean {
  if (!committed) return false;

  if (Math.abs(candidate.zoom - committed.zoom) >= 0.04) return true;

  const width = Math.max(Math.abs(committed.bounds.east - committed.bounds.west), 1e-9);
  const height = Math.max(Math.abs(committed.bounds.north - committed.bounds.south), 1e-9);
  const horizontalShift = Math.abs(candidate.center.lng - committed.center.lng) / width;
  const verticalShift = Math.abs(candidate.center.lat - committed.center.lat) / height;

  return Math.max(horizontalShift, verticalShift) >= 0.035;
}

export function mapResultCountAnnouncement(placeCount: number): string {
  if (placeCount === 0) return "No matching places in this area.";
  return `Showing ${placeCount.toLocaleString("en-US")} ${
    placeCount === 1 ? "place" : "places"
  } in this area.`;
}
