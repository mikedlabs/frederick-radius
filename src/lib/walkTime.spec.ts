import { describe, it, expect } from "vitest";
import {
  WALK_LABEL_MAX_METERS,
  WALK_ROUTE_MAX_POINTS,
  WALK_TIME_MAX_METERS,
  normalizeWalkRouteCoordinates,
  shouldFetchWalkTime,
  roundCoord,
  walkTimeQuery,
} from "@/lib/walkTime";

/**
 * Walk-time helper tests (real Mapbox walking minutes on the map's
 * directions chip). The gate decides when a metered Directions call is
 * worth making; the rounding keeps precise user locations out of URLs
 * and cache keys while snapping nearby users onto one cache entry.
 */
describe("shouldFetchWalkTime", () => {
  it("fetches inside walkable range, where the chip shows a walk figure", () => {
    expect(shouldFetchWalkTime(1)).toBe(true);
    expect(shouldFetchWalkTime(300)).toBe(true);
    expect(shouldFetchWalkTime(WALK_LABEL_MAX_METERS)).toBe(true);
  });

  it("skips beyond walkable range — the chip reads as a drive there", () => {
    expect(shouldFetchWalkTime(WALK_LABEL_MAX_METERS + 1)).toBe(false);
    // Inside the API sanity radius but outside the display range: still
    // no fetch — the routed number would never render.
    expect(shouldFetchWalkTime(2000)).toBe(false);
    expect(shouldFetchWalkTime(WALK_TIME_MAX_METERS + 1)).toBe(false);
  });

  it("fails closed on degenerate distances (bad fix, self-distance)", () => {
    expect(shouldFetchWalkTime(0)).toBe(false);
    expect(shouldFetchWalkTime(-5)).toBe(false);
    expect(shouldFetchWalkTime(NaN)).toBe(false);
    expect(shouldFetchWalkTime(Infinity)).toBe(false);
  });
});

describe("roundCoord", () => {
  it("rounds to 3 decimal places (~100m grid)", () => {
    expect(roundCoord(39.41437)).toBe(39.414);
    expect(roundCoord(39.41451)).toBe(39.415);
    expect(roundCoord(-77.41049)).toBe(-77.41);
    expect(roundCoord(-77.41062)).toBe(-77.411);
  });

  it("is idempotent on already-rounded values", () => {
    expect(roundCoord(39.414)).toBe(39.414);
    expect(roundCoord(-77.411)).toBe(-77.411);
  });
});

describe("walkTimeQuery", () => {
  it("rounds the origin but keeps the destination exact", () => {
    const q = walkTimeQuery(
      { lng: -77.41049, lat: 39.41437 },
      { lng: -77.40712, lat: 39.41601 },
    );
    expect(q).toBe("olng=-77.41&olat=39.414&dlng=-77.40712&dlat=39.41601");
  });

  it("gives two fixes ~50m apart the same URL — one shared cache entry", () => {
    const dest = { lng: -77.4071, lat: 39.416 };
    const a = walkTimeQuery({ lng: -77.41031, lat: 39.41412 }, dest);
    const b = walkTimeQuery({ lng: -77.40989, lat: 39.41439 }, dest);
    expect(a).toBe(b);
  });

  it("adds geometry only for an explicit opt-in", () => {
    const origin = { lng: -77.41049, lat: 39.41437 };
    const dest = { lng: -77.40712, lat: 39.41601 };

    expect(walkTimeQuery(origin, dest)).not.toContain("geometry=");
    expect(walkTimeQuery(origin, dest, { geometry: true })).toBe(
      "olng=-77.41&olat=39.414&dlng=-77.40712&dlat=39.41601&geometry=1",
    );
  });
});

describe("normalizeWalkRouteCoordinates", () => {
  it("returns compact GeoJSON positions and drops malformed points", () => {
    expect(
      normalizeWalkRouteCoordinates([
        [-77.4104912, 39.4143712],
        [-77.4104911, 39.4143711], // duplicate after 5-decimal rounding
        ["bad", 39.415],
        ["-77.409", "39.415"], // GeoJSON positions must contain numbers
        [-77.4087654, 39.4156789, 12], // elevation is intentionally omitted
        [181, 39.416],
        [-77.4071234, 39.4160123],
      ]),
    ).toEqual([
      [-77.41049, 39.41437],
      [-77.40877, 39.41568],
      [-77.40712, 39.41601],
    ]);
  });

  it("fails soft when fewer than two valid positions remain", () => {
    expect(normalizeWalkRouteCoordinates(null)).toBeUndefined();
    expect(normalizeWalkRouteCoordinates([[-77.41, 39.414]])).toBeUndefined();
    expect(normalizeWalkRouteCoordinates([["bad", "coords"]])).toBeUndefined();
  });

  it("caps unexpectedly detailed lines while preserving endpoints", () => {
    const raw = Array.from({ length: WALK_ROUTE_MAX_POINTS + 50 }, (_, index) => [
      -77.6 + index * 0.001,
      39.3 + index * 0.001,
    ]);
    const normalized = normalizeWalkRouteCoordinates(raw);

    expect(normalized).toHaveLength(WALK_ROUTE_MAX_POINTS);
    expect(normalized?.[0]).toEqual([-77.6, 39.3]);
    expect(normalized?.at(-1)).toEqual([-77.295, 39.605]);
  });
});
