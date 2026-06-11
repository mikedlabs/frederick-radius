import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isInFrederickCounty } from "@/components/map/constants";

/**
 * Committed overlay data (6.3/6.4). The GIS pulls live as static GeoJSON
 * in public/overlays. These tests guard the load-bearing properties: the
 * files parse, carry features, sit inside the county, and stay small
 * enough to ship static (the brief's 1 MB ceiling), so a future re-pull
 * that breaks any of these fails the build.
 */
function load(layer: string) {
  const raw = readFileSync(path.join(process.cwd(), "public", "overlays", `${layer}.geojson`), "utf-8");
  return { raw, gj: JSON.parse(raw) as GeoJSON.FeatureCollection };
}

describe.each(["parks", "markets"])("overlay %s", (layer) => {
  const { raw, gj } = load(layer);

  it("is a FeatureCollection with point features", () => {
    expect(gj.type).toBe("FeatureCollection");
    expect(gj.features.length).toBeGreaterThan(0);
    expect(gj.features[0].geometry.type).toBe("Point");
  });

  it("every point sits inside the county", () => {
    for (const f of gj.features) {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      expect(isInFrederickCounty(lng, lat)).toBe(true);
    }
  });

  it("ships well under the 1 MB static ceiling", () => {
    expect(raw.length).toBeLessThan(1_000_000);
  });
});

describe("county boundary overlay", () => {
  const { gj } = load("county-boundary");
  it("is a single polygon", () => {
    expect(gj.features).toHaveLength(1);
    expect(["Polygon", "MultiPolygon"]).toContain(gj.features[0].geometry.type);
  });
});
