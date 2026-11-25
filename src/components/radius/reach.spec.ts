import { describe, expect, it } from "vitest";
import {
  collectReachPolygons,
  reachModeHref,
  isPointWithinReach,
} from "./reach";

const square: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-77.42, 39.4],
            [-77.4, 39.4],
            [-77.4, 39.42],
            [-77.42, 39.42],
            [-77.42, 39.4],
          ],
        ],
      },
    },
  ],
};

describe("radius reach boundary", () => {
  it("carries the selected area and time into travel reach without device coordinates", () => {
    expect(reachModeHref("town:thurmont", 15)).toBe("/map?mode=radius&minutes=15&in=thurmont");
    expect(reachModeHref("nearme")).toBe("/map?mode=radius&in=nearme");
    expect(reachModeHref(null)).toBe("/map?mode=radius");
  });
  it("uses the Mapbox polygon instead of straight-line distance when loaded", () => {
    const polygons = collectReachPolygons(square);

    expect(
      isPointWithinReach({
        point: [-77.41, 39.41],
        distanceMeters: 50_000,
        maxDistanceMeters: 1_000,
        polygons,
      }),
    ).toBe(true);
    expect(
      isPointWithinReach({
        point: [-77.39, 39.41],
        distanceMeters: 100,
        maxDistanceMeters: 1_000,
        polygons,
      }),
    ).toBe(false);
  });

  it("uses the distance circle only while no street polygon is available", () => {
    expect(
      isPointWithinReach({
        point: [-77.39, 39.41],
        distanceMeters: 999,
        maxDistanceMeters: 1_000,
        polygons: null,
      }),
    ).toBe(true);
    expect(
      isPointWithinReach({
        point: [-77.41, 39.41],
        distanceMeters: 1_001,
        maxDistanceMeters: 1_000,
        polygons: [],
      }),
    ).toBe(false);
  });
});
