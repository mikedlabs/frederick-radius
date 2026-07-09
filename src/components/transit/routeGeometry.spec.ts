import { describe, it, expect } from "vitest";
import TRANSIT from "@/data/transit.json";
import { buildShape, projectToShape, pearlsFor, fractionAlong } from "./routeGeometry";

// A simple L-shaped test polyline: east 0.01°, then north 0.01°.
const L_SHAPE = buildShape([
  [39.4, -77.45],
  [39.4, -77.44],
  [39.41, -77.44],
]);

describe("projectToShape", () => {
  it("projects a point onto the nearest segment", () => {
    // Slightly north of the first (east-west) leg's midpoint.
    const { s, d } = projectToShape(L_SHAPE, { lat: 39.4005, lng: -77.445 });
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(L_SHAPE.cum[1]); // lands on leg 1, not leg 2
    expect(d).toBeCloseTo(0.0005, 4); // the perpendicular offset
  });

  it("clamps beyond the ends to the endpoints", () => {
    const before = projectToShape(L_SHAPE, { lat: 39.4, lng: -77.46 });
    expect(before.s).toBe(0);
    const after = projectToShape(L_SHAPE, { lat: 39.42, lng: -77.44 });
    expect(after.s).toBeCloseTo(L_SHAPE.total, 6);
  });
});

describe("fractionAlong", () => {
  it("returns 0..1 for a fix on a real route, null for unknown routes", () => {
    const routeId = Object.keys(TRANSIT.shapes)[0];
    const [lat, lng] = (TRANSIT.shapes as Record<string, number[][]>)[routeId][5];
    const frac = fractionAlong(routeId, { lat, lng });
    expect(frac).not.toBeNull();
    expect(frac!).toBeGreaterThanOrEqual(0);
    expect(frac!).toBeLessThanOrEqual(1);
    expect(fractionAlong("no-such-route", { lat, lng })).toBeNull();
  });
});

describe("pearlsFor", () => {
  it("derives an ordered, bounded stop sequence for every published route", () => {
    for (const r of TRANSIT.routes as { id: string }[]) {
      const pearls = pearlsFor(r.id);
      // Every TransIT route serves stops; the projection threshold must
      // find a plausible number of them (and the thinning must cap it).
      expect(pearls.length).toBeGreaterThanOrEqual(5);
      expect(pearls.length).toBeLessThanOrEqual(24);
      for (let i = 1; i < pearls.length; i++) {
        expect(pearls[i].frac).toBeGreaterThanOrEqual(pearls[i - 1].frac);
      }
      expect(pearls[0].frac).toBeGreaterThanOrEqual(0);
      expect(pearls[pearls.length - 1].frac).toBeLessThanOrEqual(1);
    }
  });

  it("returns the cached array on repeat calls", () => {
    const routeId = (TRANSIT.routes as { id: string }[])[0].id;
    expect(pearlsFor(routeId)).toBe(pearlsFor(routeId));
  });
});
