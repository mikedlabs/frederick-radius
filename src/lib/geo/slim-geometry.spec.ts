import { describe, it, expect } from "vitest";
import { simplifyLine, slimGeometryFC } from "./slim-geometry";

type FC = Parameters<typeof slimGeometryFC>[0];

const fc = (features: FC["features"]): FC => ({ type: "FeatureCollection", features });
const feat = (geometry: unknown, properties = {}): FC["features"][number] => ({
  type: "Feature",
  geometry,
  properties,
});

describe("simplifyLine", () => {
  it("drops collinear middle points, keeps endpoints", () => {
    const out = simplifyLine(
      [[0, 0], [1, 0.000001], [2, 0], [3, 0.000001], [4, 0]],
      0.0001,
    );
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([4, 0]);
    expect(out.length).toBe(2);
  });

  it("keeps a genuine corner", () => {
    const out = simplifyLine([[0, 0], [1, 0], [1, 1]], 0.0001);
    expect(out).toEqual([[0, 0], [1, 0], [1, 1]]);
  });

  it("tolerance 0 is a no-op", () => {
    const pts: [number, number][] = [[0, 0], [1, 0.5], [2, 0]];
    expect(simplifyLine(pts, 0)).toBe(pts);
  });
});

describe("slimGeometryFC", () => {
  it("rounds coordinates to the requested decimals", () => {
    const out = slimGeometryFC(
      fc([feat({ type: "LineString", coordinates: [[-77.28908997678191, 39.41234567891], [-77.3, 39.5]] })]),
      { decimals: 5 },
    );
    expect((out.features[0].geometry as { coordinates: number[][] }).coordinates[0]).toEqual([-77.28909, 39.41235]);
  });

  it("keeps polygon rings closed after simplification", () => {
    const ring = [[-77.4, 39.4], [-77.40001, 39.45], [-77.35, 39.45], [-77.35, 39.4], [-77.4, 39.4]];
    const out = slimGeometryFC(
      fc([feat({ type: "Polygon", coordinates: [ring] })]),
      { decimals: 5, tolerance: 0.0002 },
    );
    const slim = (out.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    expect(slim[0]).toEqual(slim[slim.length - 1]);
    expect(slim.length).toBeGreaterThanOrEqual(4);
  });

  it("drops a ring that collapses below drawable and the feature with it", () => {
    const out = slimGeometryFC(
      fc([feat({ type: "Polygon", coordinates: [[[-77.4, 39.4], [-77.4, 39.4], [-77.4, 39.4]]] })]),
      { decimals: 5, tolerance: 0.0002 },
    );
    expect(out.features).toHaveLength(0);
  });

  it("passes unknown geometry types through untouched", () => {
    const pt = feat({ type: "Point", coordinates: [-77.412345678, 39.4] });
    const out = slimGeometryFC(fc([pt]));
    expect(out.features[0]).toBe(pt);
  });

  it("handles MultiLineString and MultiPolygon", () => {
    const out = slimGeometryFC(
      fc([
        feat({ type: "MultiLineString", coordinates: [[[-77.41234567, 39.4], [-77.5, 39.5]]] }),
        feat({
          type: "MultiPolygon",
          coordinates: [[[[-77.4, 39.4], [-77.4, 39.45], [-77.35, 39.45], [-77.35, 39.4], [-77.4, 39.4]]]],
        }),
      ]),
      { decimals: 5, tolerance: 0.00001 },
    );
    expect(out.features).toHaveLength(2);
    const mls = out.features[0].geometry as { coordinates: number[][][] };
    expect(mls.coordinates[0][0]).toEqual([-77.41235, 39.4]);
  });

  it("shrinks a dense wiggly ring substantially at display tolerance", () => {
    // A 400-vertex circle-ish ring with sub-meter noise: display
    // simplification should cut the vertex count hard.
    const ring: [number, number][] = [];
    for (let i = 0; i < 400; i++) {
      const a = (i / 400) * Math.PI * 2;
      ring.push([
        -77.4 + 0.05 * Math.cos(a) + Math.random() * 0.000001,
        39.4 + 0.05 * Math.sin(a),
      ]);
    }
    ring.push(ring[0]);
    const out = slimGeometryFC(fc([feat({ type: "Polygon", coordinates: [ring] })]), {
      decimals: 5,
      tolerance: 0.0002,
    });
    const slim = (out.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    expect(slim.length).toBeLessThan(ring.length / 3);
    expect(slim.length).toBeGreaterThan(10); // still visibly a circle
  });
});
