import { describe, it, expect } from "vitest";
import { getCountyBoundary } from "@/lib/integrations/fcGis";

/**
 * County boundary outline (6.1). The loader reads the committed static
 * GeoJSON (no network) and hands the map a polygon FC to draw as the
 * quiet always-on county edge. If the file goes missing or malformed it
 * must fail soft to empty, never throw into the map render.
 */
describe("getCountyBoundary (6.1)", () => {
  it("returns the county polygon from committed static data", async () => {
    const fc = await getCountyBoundary();
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features.length).toBeGreaterThan(0);
    expect(["Polygon", "MultiPolygon"]).toContain(fc.features[0].geometry.type);
  });
});
