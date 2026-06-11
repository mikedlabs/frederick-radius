import { describe, it, expect } from "vitest";
import {
  isInFrederickCounty,
  FREDERICK_MAX_BOUNDS,
  FREDERICK_MIN_ZOOM,
  FREDERICK_MAX_ZOOM,
} from "@/components/map/constants";
import { PLACES } from "@/data/places";

/**
 * County lock (data brief 6.2). The map can never pan out of the county,
 * geolocation outside it falls back to downtown, and the zoom is clamped.
 * The load-bearing safety property: every real place pin sits inside the
 * pan bounds, so the leash never strands a place the user tapped.
 */
describe("county lock (6.2)", () => {
  it("every place with coordinates is inside the pan bounds", () => {
    const stranded = PLACES.filter(
      (p) => p.geom && !isInFrederickCounty(p.geom.lng, p.geom.lat),
    ).map((p) => p.slug);
    expect(stranded, `stranded pins: ${stranded.slice(0, 8).join(", ")}`).toEqual([]);
  });

  it("downtown Frederick is inside, clearly remote points are outside", () => {
    // The pan bounds are a coarse rectangle, not the precise GIS county
    // polygon (the brief draws the OUTLINE from GIS; this is only the
    // leash). It is padded west to reach the real Myersville and
    // Burkittsville pins, so it includes a sliver of neighboring area.
    // The check still catches clearly-remote users for the geolocation
    // fallback, which is its job.
    expect(isInFrederickCounty(-77.4105, 39.4143)).toBe(true); // downtown
    expect(isInFrederickCounty(-76.61, 39.29)).toBe(false); // Baltimore
    expect(isInFrederickCounty(-77.04, 38.9)).toBe(false); // DC (east + south)
    expect(isInFrederickCounty(-78.2, 39.5)).toBe(false); // Cumberland, far west
    expect(isInFrederickCounty(-77.4, 40.1)).toBe(false); // into Pennsylvania
  });

  it("bounds and zoom clamp match the brief's county-lock intent", () => {
    const [[w, s], [e, n]] = FREDERICK_MAX_BOUNDS;
    expect(w).toBeLessThan(e);
    expect(s).toBeLessThan(n);
    // A tight county box, not the old half-a-state leash.
    expect(e - w).toBeLessThan(0.9);
    expect(n - s).toBeLessThan(0.7);
    expect(FREDERICK_MIN_ZOOM).toBe(9);
    expect(FREDERICK_MAX_ZOOM).toBe(19);
  });
});
