import { describe, expect, it } from "vitest";
import { SEARCH_FRAME_RESULT_LIMIT, searchResultFrame } from "./searchResultFrame";

const downtown = { lng: -77.4105, lat: 39.4143 };

describe("searchResultFrame", () => {
  it("does not move the camera when the search found nothing", () => {
    expect(searchResultFrame([])).toBeNull();
  });

  it("focuses a single result", () => {
    expect(searchResultFrame([downtown])).toEqual({ kind: "point", center: [downtown.lng, downtown.lat] });
  });

  it("frames the leading results of a category search", () => {
    const frame = searchResultFrame([
      downtown,
      { lng: -77.405, lat: 39.418 },
      { lng: -77.42, lat: 39.41 },
    ]);
    expect(frame).toEqual({ kind: "bounds", bounds: [[-77.42, 39.41], [-77.405, 39.418]] });
  });

  it("ignores a far result past the ranked limit", () => {
    const near = Array.from({ length: SEARCH_FRAME_RESULT_LIMIT }, (_, i) => ({
      lng: downtown.lng + i * 0.001,
      lat: downtown.lat,
    }));
    const frame = searchResultFrame([...near, { lng: -77.33, lat: 39.68 }]);
    expect(frame?.kind).toBe("bounds");
    if (frame?.kind === "bounds") expect(frame.bounds[1][1]).toBeCloseTo(downtown.lat);
  });

  it("keeps the county frame when the results already span the county", () => {
    expect(searchResultFrame([
      { lng: -77.68, lat: 39.22 },
      { lng: -77.1, lat: 39.72 },
    ])).toBeNull();
  });
});
