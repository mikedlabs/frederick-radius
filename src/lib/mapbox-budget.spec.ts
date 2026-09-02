import { describe, expect, it } from "vitest";
import {
  mapboxDailyUsageCap,
  mapboxMatrixRuntimeEnabled,
  mapboxRequestRuntimeEnabled,
} from "@/lib/mapbox-budget";

describe("mapboxDailyUsageCap", () => {
  it("uses conservative defaults in the provider's billed units", () => {
    expect(mapboxDailyUsageCap("search_box_session", undefined)).toBe(75);
    expect(mapboxDailyUsageCap("permanent_geocode", undefined)).toBe(20);
    expect(mapboxDailyUsageCap("matrix_element", undefined)).toBe(1_000);
    expect(mapboxDailyUsageCap("directions_request", undefined)).toBe(250);
    expect(mapboxDailyUsageCap("isochrone_request", undefined)).toBe(100);
    expect(mapboxDailyUsageCap("static_request", undefined)).toBe(500);
  });

  it("accepts positive configured limits", () => {
    expect(mapboxDailyUsageCap("search_box_session", "40")).toBe(40);
    expect(mapboxDailyUsageCap("permanent_geocode", "12")).toBe(12);
    expect(mapboxDailyUsageCap("matrix_element", "600")).toBe(600);
    expect(mapboxDailyUsageCap("directions_request", "120")).toBe(120);
    expect(mapboxDailyUsageCap("isochrone_request", "60")).toBe(60);
    expect(mapboxDailyUsageCap("static_request", "400")).toBe(400);
  });

  it("falls back on invalid values and cannot exceed code-owned maxima", () => {
    expect(mapboxDailyUsageCap("search_box_session", "nope")).toBe(75);
    expect(mapboxDailyUsageCap("permanent_geocode", "1.5")).toBe(20);
    expect(mapboxDailyUsageCap("search_box_session", "9999")).toBe(250);
    expect(mapboxDailyUsageCap("permanent_geocode", "9999")).toBe(50);
    expect(mapboxDailyUsageCap("matrix_element", "9999")).toBe(3_000);
    expect(mapboxDailyUsageCap("directions_request", "9999")).toBe(500);
    expect(mapboxDailyUsageCap("isochrone_request", "9999")).toBe(250);
    expect(mapboxDailyUsageCap("static_request", "9999")).toBe(1_000);
    expect(mapboxDailyUsageCap("search_box_session", "0")).toBe(1);
  });

  it("allows request-priced routes and Matrix to be configured to zero", () => {
    expect(mapboxDailyUsageCap("matrix_element", "0")).toBe(0);
    expect(mapboxDailyUsageCap("directions_request", "0")).toBe(0);
    expect(mapboxDailyUsageCap("isochrone_request", "0")).toBe(0);
    expect(mapboxDailyUsageCap("static_request", "0")).toBe(0);
    expect(mapboxDailyUsageCap("search_box_session", "0")).toBe(1);
    expect(mapboxDailyUsageCap("permanent_geocode", "0")).toBe(1);
  });
});

describe("mapboxRequestRuntimeEnabled", () => {
  it.each(["directions", "isochrone", "static"] as const)(
    "requires the dedicated %s switch and a nonzero allowance",
    (feature) => {
      expect(mapboxRequestRuntimeEnabled(feature, "1", "25")).toBe(true);
      expect(mapboxRequestRuntimeEnabled(feature, "0", "25")).toBe(false);
      expect(mapboxRequestRuntimeEnabled(feature, undefined, "25")).toBe(
        false,
      );
      expect(mapboxRequestRuntimeEnabled(feature, "1", "0")).toBe(false);
    },
  );

  it("cannot be enabled above the code-owned maximum", () => {
    expect(mapboxRequestRuntimeEnabled("directions", "1", "999999")).toBe(
      true,
    );
    expect(mapboxDailyUsageCap("directions_request", "999999")).toBe(500);
  });
});

describe("mapboxMatrixRuntimeEnabled", () => {
  it("requires both the global switch and a nonzero element allowance", () => {
    expect(mapboxMatrixRuntimeEnabled("1", "1000")).toBe(true);
    expect(mapboxMatrixRuntimeEnabled("0", "1000")).toBe(false);
    expect(mapboxMatrixRuntimeEnabled(undefined, "1000")).toBe(false);
    expect(mapboxMatrixRuntimeEnabled("1", "0")).toBe(false);
  });

  it("uses the conservative default for invalid caps", () => {
    expect(mapboxMatrixRuntimeEnabled("1", "not-a-number")).toBe(true);
  });
});
