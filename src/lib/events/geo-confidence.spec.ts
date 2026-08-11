import { describe, expect, it } from "vitest";
import {
  eventHasPreciseDisplayLocation,
  eventHasPreciseLocation,
} from "./geo-confidence";

describe("eventHasPreciseLocation", () => {
  it("rejects the county fallback coordinate", () => {
    expect(
      eventHasPreciseLocation({
        geom: { lng: -77.4109, lat: 39.4143 },
        geo_confidence: "area",
      }),
    ).toBe(false);
  });

  it("rejects an explicitly unknown non-centroid coordinate", () => {
    expect(
      eventHasPreciseLocation({
        geom: { lng: -77.425, lat: 39.505 },
        geo_confidence: "unknown",
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

describe("eventHasPreciseDisplayLocation", () => {
  it("requires both an explicit precision stamp and an in-county coordinate", () => {
    expect(eventHasPreciseDisplayLocation({
      geom: { lng: -77.397003, lat: 39.446694 },
      geo_confidence: "venue_match",
    })).toBe(true);
    expect(eventHasPreciseDisplayLocation({
      geom: { lng: -77.397003, lat: 39.446694 },
      geo_confidence: "area",
    })).toBe(false);
    expect(eventHasPreciseDisplayLocation({
      geom: { lng: -76.6, lat: 39.4 },
      geo_confidence: "exact_address",
    })).toBe(false);
  });
});
