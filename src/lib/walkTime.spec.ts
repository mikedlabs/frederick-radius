import { describe, it, expect } from "vitest";
import {
  WALK_LABEL_MAX_METERS,
  WALK_TIME_MAX_METERS,
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
});
