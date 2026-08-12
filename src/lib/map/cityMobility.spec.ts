import { describe, expect, it } from "vitest";
import {
  CITY_MOBILITY_EXTENT,
  cityMobilityStatusLabel,
  cityMobilityViewportQuery,
  parseCityMobilityBounds,
  validateCityMobilityBounds,
} from "./cityMobility";

describe("City mobility request bounds", () => {
  it("accepts a bounded WGS84 viewport and rejects a county-sized request", () => {
    expect(
      validateCityMobilityBounds({
        west: -77.43,
        south: 39.4,
        east: -77.38,
        north: 39.45,
      }),
    ).toMatchObject({ ok: true });
    expect(
      validateCityMobilityBounds({
        west: -77.7,
        south: 39.2,
        east: -77.1,
        north: 39.7,
      }),
    ).toEqual({ ok: false, reason: "area-too-large" });
  });

  it("supports a capped user-area query", () => {
    const result = parseCityMobilityBounds(
      new URLSearchParams("lat=39.4143&lng=-77.4105&radiusM=1200"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bounds.west).toBeLessThan(-77.4105);
      expect(result.bounds.east).toBeGreaterThan(-77.4105);
    }
    expect(
      parseCityMobilityBounds(
        new URLSearchParams("lat=39.4143&lng=-77.4105&radiusM=5000"),
      ),
    ).toEqual({ ok: false, reason: "invalid-area" });
  });

  it("queries only a close City viewport", () => {
    expect(cityMobilityViewportQuery(CITY_MOBILITY_EXTENT, 12)).toBeNull();
    expect(
      cityMobilityViewportQuery(
        { west: -77.43, south: 39.4, east: -77.38, north: 39.45 },
        12.68,
      ),
    ).toBe("-77.43000,39.40000,-77.38000,39.45000");
    expect(
      cityMobilityViewportQuery(
        { west: -77.43, south: 39.4, east: -77.38, north: 39.45 },
        14,
      ),
    ).toBe("-77.43000,39.40000,-77.38000,39.45000");
    expect(
      cityMobilityViewportQuery(
        { west: -77.63, south: 39.3, east: -77.58, north: 39.35 },
        14,
      ),
    ).toBeNull();
  });
});

describe("City mobility status copy", () => {
  it("distinguishes partial, stale, and unavailable data", () => {
    expect(cityMobilityStatusLabel("current", "partial")).toContain("Some");
    expect(cityMobilityStatusLabel("stale", "complete")).toContain("earlier");
    expect(cityMobilityStatusLabel("unavailable", "partial")).toContain(
      "unavailable",
    );
  });
});
