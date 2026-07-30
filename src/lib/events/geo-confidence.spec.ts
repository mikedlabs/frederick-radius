import { describe, expect, it } from "vitest";
import { eventHasPreciseLocation } from "./geo-confidence";

describe("eventHasPreciseLocation", () => {
  it("rejects the county fallback coordinate", () => {
    expect(
      eventHasPreciseLocation({
        geom: { lng: -77.4109, lat: 39.4143 },
        geo_confidence: "area",
      }),
    ).toBe(false);
  });

  it("accepts an exact event coordinate", () => {
    expect(
      eventHasPreciseLocation({
        geom: { lng: -77.397003, lat: 39.446694 },
        geo_confidence: "exact_address",
      }),
    ).toBe(true);
  });

  it("accepts a resolved venue even near an area anchor", () => {
    expect(
      eventHasPreciseLocation(
        {
          geom: { lng: -77.4109, lat: 39.4137 },
          geo_confidence: "area",
        },
        true,
      ),
    ).toBe(true);
  });

  it("keeps a legacy curated non-centroid coordinate", () => {
    expect(
      eventHasPreciseLocation({
        geom: { lng: -77.397003, lat: 39.446694 },
      }),
    ).toBe(true);
  });
});
