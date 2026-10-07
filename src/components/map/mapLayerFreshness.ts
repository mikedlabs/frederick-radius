import type { MapLayerGroup } from "./deferredBrowseLayers";

/** Match the existing source snapshot intervals; geometry is not live data. */
export const MAP_LAYER_MAX_AGE_MS: Record<MapLayerGroup, number> = {
  context: 5 * 60_000,
  signals: 60_000,
  roads: 60_000,
  parking: 60_000,
  events: 5 * 60_000,
  amenities: 15 * 60_000,
  outdoors: 7 * 24 * 60 * 60_000,
  transit: 7 * 24 * 60 * 60_000,
  boundaries: 7 * 24 * 60 * 60_000,
};

export const LIVE_MAP_LAYER_GROUPS: readonly MapLayerGroup[] = [
  "signals", "roads", "parking", "events", "amenities",
];
export const MAP_LAYER_REQUEST_TIMEOUT_MS = 8_000;
export const MAP_LAYER_RETRY_INTERVAL_MS = 60_000;

export function mapLayerCacheControl(groups: ReadonlySet<MapLayerGroup>): string {
  if (![...groups].some((group) => LIVE_MAP_LAYER_GROUPS.includes(group))) {
    return "public, s-maxage=300, stale-while-revalidate=900";
  }
  const seconds = Math.min(...[...groups].map((group) => MAP_LAYER_MAX_AGE_MS[group])) / 1_000;
  return `public, s-maxage=${seconds}, stale-while-revalidate=60`;
}
