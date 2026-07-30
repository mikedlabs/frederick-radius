import { describe, expect, it } from "vitest";
import { scopeHistoricOverlay } from "./historicOverlay";

describe("scopeHistoricOverlay", () => {
  it("drops invalid and out-of-county historic reference points", () => {
    const raw = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { name: "Frederick" }, geometry: { type: "Point", coordinates: [-77.4105, 39.4143] } },
        { type: "Feature", properties: { name: "Gettysburg" }, geometry: { type: "Point", coordinates: [-77.2311, 39.8309] } },
        { type: "Feature", properties: { name: "Broken" }, geometry: null },
      ],
    };
    expect(scopeHistoricOverlay(raw).features.map((feature) => feature.properties?.name)).toEqual(["Frederick"]);
  });
});
