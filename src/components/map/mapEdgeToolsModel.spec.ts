import { describe, expect, it } from "vitest";
import {
  MAP_EDGE_OVERLAY_IDS,
  activeMapEdgeOverlayCount,
  visibleMapEdgeOverlayIds,
  type MapEdgeOverlayState,
} from "./mapEdgeToolsModel";

const off = (): MapEdgeOverlayState => ({
  incidents: false,
  aviation: false,
  traffic: false,
  radar: false,
  parking: false,
  transit: false,
  trails: false,
  cameras: false,
  aerial: false,
});

describe("map edge tools", () => {
  it("keeps only active overlays visible when the flat picker is closed", () => {
    const state = { ...off(), incidents: true, traffic: true, trails: true };
    expect(visibleMapEdgeOverlayIds(false, state)).toEqual([
      "incidents",
      "traffic",
      "trails",
    ]);
    expect(activeMapEdgeOverlayCount(state)).toBe(3);
  });

  it("reveals every tool in a stable, attention-first order when opened", () => {
    expect(visibleMapEdgeOverlayIds(true, off())).toEqual([
      "incidents",
      "aviation",
      "traffic",
      "radar",
      "parking",
      "transit",
      "trails",
      "cameras",
      "aerial",
    ]);
    expect(MAP_EDGE_OVERLAY_IDS[0]).toBe("incidents");
  });
});
