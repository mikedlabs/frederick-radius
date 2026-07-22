import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isInFrederickCountyArea } from "@/lib/geo";
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

  it("scopes the committed historic feed before it reaches the map", () => {
    const raw = JSON.parse(readFileSync("public/overlays/historic.geojson", "utf8")) as GeoJSON.FeatureCollection;
    const scoped = scopeHistoricOverlay(raw);
    expect(scoped.features.length).toBeGreaterThan(100);
    expect(scoped.features.length).toBeLessThan(raw.features.length);
    expect(scoped.features.every((feature) => {
      if (feature.geometry.type !== "Point") return false;
      const [lng, lat] = feature.geometry.coordinates;
      return isInFrederickCountyArea(lng, lat);
    })).toBe(true);
  });
});
