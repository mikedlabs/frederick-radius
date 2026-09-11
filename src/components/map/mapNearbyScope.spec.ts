import { describe, expect, it } from "vitest";
import { nearbyReachBounds, placesWithinReach } from "./mapNearbyScope";

const origin = { lat: 39.4143, lng: -77.4105 };

describe("map near-me scope", () => {
  it("keeps only places inside the promised reach", () => {
    const nearby = { id: "nearby", geom: { lat: 39.419, lng: -77.41 } };
    const countywide = { id: "countywide", geom: { lat: 39.32, lng: -77.35 } };

    expect(placesWithinReach([countywide, nearby], origin, 1_609)).toEqual([
      nearby,
    ]);
  });

  it("builds a balanced view around the location", () => {
    const [[west, south], [east, north]] = nearbyReachBounds(origin, 1_609);
    expect(west).toBeLessThan(origin.lng);
    expect(east).toBeGreaterThan(origin.lng);
    expect(south).toBeLessThan(origin.lat);
    expect(north).toBeGreaterThan(origin.lat);
    expect(Math.abs((west + east) / 2 - origin.lng)).toBeLessThan(0.000001);
    expect(Math.abs((south + north) / 2 - origin.lat)).toBeLessThan(0.000001);
  });

  it("does not turn an invalid reach into the whole catalog", () => {
    expect(
      placesWithinReach([{ geom: origin }], origin, Number.NaN),
    ).toEqual([]);
  });
});
