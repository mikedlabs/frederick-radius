export const MAP_EDGE_OVERLAY_IDS = [
  "incidents",
  "aviation",
  "traffic",
  "radar",
  "parking",
  "transit",
  "trails",
  "cameras",
  "aerial",
] as const;

export type MapEdgeOverlayId = (typeof MAP_EDGE_OVERLAY_IDS)[number];
export type MapEdgeOverlayState = Record<MapEdgeOverlayId, boolean>;

/** The closed rail keeps active layers visible; opening it reveals the whole
 * one-level tool set without introducing another nested menu. */
export function visibleMapEdgeOverlayIds(
  open: boolean,
  state: MapEdgeOverlayState,
): MapEdgeOverlayId[] {
  return open
    ? [...MAP_EDGE_OVERLAY_IDS]
    : MAP_EDGE_OVERLAY_IDS.filter((id) => state[id]);
}

export function activeMapEdgeOverlayCount(
  state: MapEdgeOverlayState,
): number {
  return MAP_EDGE_OVERLAY_IDS.filter((id) => state[id]).length;
}
