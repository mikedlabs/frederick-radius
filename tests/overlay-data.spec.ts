import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Public-domain static boundary used to frame the county map. */
function load(layer: string) {
  const raw = readFileSync(path.join(process.cwd(), "public", "overlays", `${layer}.geojson`), "utf-8");
  return { raw, gj: JSON.parse(raw) as GeoJSON.FeatureCollection };
}

describe("county boundary overlay", () => {
  const { raw, gj } = load("county-boundary");
  it("is a single polygon", () => {
    expect(gj.features).toHaveLength(1);
    expect(["Polygon", "MultiPolygon"]).toContain(gj.features[0].geometry.type);
    expect(gj.features[0].properties).toMatchObject({
      geoid: "24021",
      source: "U.S. Census Bureau TIGERweb",
    });
    expect(raw.length).toBeLessThan(1_000_000);
  });
});
