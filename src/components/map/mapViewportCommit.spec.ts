import { describe, expect, it } from "vitest";
import {
  mapResultCountAnnouncement,
  resultViewportChanged,
  type MapResultViewport,
} from "./mapViewportCommit";

const committed: MapResultViewport = {
  center: { lng: -77.41, lat: 39.42 },
  zoom: 12,
  bounds: {
    west: -77.51,
    east: -77.31,
    south: 39.32,
    north: 39.52,
  },
};

describe("deliberate map result-area commits", () => {
  it("ignores camera settling that is too small to change the reader's area", () => {
    expect(
      resultViewportChanged(committed, {
        ...committed,
        center: { lng: -77.405, lat: 39.42 },
        zoom: 12.01,
      }),
    ).toBe(false);
  });

  it("detects a meaningful pan relative to the committed viewport", () => {
    expect(
      resultViewportChanged(committed, {
        ...committed,
        center: { lng: -77.401, lat: 39.42 },
      }),
    ).toBe(true);
  });

  it("detects a deliberate zoom without requiring a center change", () => {
    expect(
      resultViewportChanged(committed, {
        ...committed,
        zoom: 12.05,
      }),
    ).toBe(true);
  });

  it("does not invent a pending area before the first viewport is committed", () => {
    expect(resultViewportChanged(null, committed)).toBe(false);
  });

  it("announces singular, plural, and empty result counts clearly", () => {
    expect(mapResultCountAnnouncement(0)).toBe("No matching places in this area.");
    expect(mapResultCountAnnouncement(1)).toBe("Showing 1 place in this area.");
    expect(mapResultCountAnnouncement(1200)).toBe(
      "Showing 1,200 places in this area.",
    );
  });
});
