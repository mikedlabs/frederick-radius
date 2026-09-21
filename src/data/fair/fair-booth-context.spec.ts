import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseFairLayoutData } from "@/lib/fair/layout";
import { fairBoothMapContexts, fairBoothNeighborhoods, findFairBoothNeighborhood } from "./fair-booth-context";

const layout = parseFairLayoutData(JSON.parse(readFileSync(new URL("../../../public/fair/layouts/great-frederick-fair-2026.json", import.meta.url), "utf8")));

describe("original Fair booth context", () => {
  it("assigns every reviewed booth to exactly one of the seven real source diagrams", () => {
    expect(fairBoothNeighborhoods.map((area) => [area.id, area.boothIds.length])).toEqual([
      ["grandstand-left", 41], ["grandstand-right", 17], ["homegrown", 18],
      ["outside-grandstands", 147], ["poultry-farm-garden", 109], ["machinery-row", 123], ["west-end", 56],
    ]);
    const assigned = fairBoothNeighborhoods.flatMap((area) => area.boothIds);
    expect(assigned).toHaveLength(511);
    expect(new Set(assigned).size).toBe(511);
    expect([...assigned].sort()).toEqual(layout.maps.flatMap((map) => map.booths.map((booth) => booth.id)).sort());
    expect(findFairBoothNeighborhood("9566:3353619")?.id).toBe("west-end");
    expect(findFairBoothNeighborhood("9566:3353654")?.id).toBe("west-end");
    expect(findFairBoothNeighborhood("unknown")).toBeUndefined();
  });

  it("keeps all four rotated booth corners inside their own source diagram and map bounds", () => {
    for (const map of layout.maps) {
      const context = fairBoothMapContexts[map.id];
      expect(context.mapId).toBe(map.id);
      expect(context.neighborhoods).toEqual(fairBoothNeighborhoods.filter((area) => area.mapId === map.id));
      for (const booth of map.booths) {
        const area = findFairBoothNeighborhood(booth.id)!;
        expect(area.mapId).toBe(map.id);
        const radians = booth.rotationDeg * Math.PI / 180;
        for (const [dx, dy] of [[0, 0], [booth.width, 0], [booth.width, booth.height], [0, booth.height]]) {
          const x = booth.x + dx * Math.cos(radians) - dy * Math.sin(radians);
          const y = booth.y + dx * Math.sin(radians) + dy * Math.cos(radians);
          for (const bounds of [area.bounds, context.bounds]) {
            expect(x, `${booth.id} x`).toBeGreaterThanOrEqual(bounds.x);
            expect(x, `${booth.id} x`).toBeLessThanOrEqual(bounds.x + bounds.width);
            expect(y, `${booth.id} y`).toBeGreaterThanOrEqual(bounds.y);
            expect(y, `${booth.id} y`).toBeLessThanOrEqual(bounds.y + bounds.height);
          }
        }
      }
    }
  });

  it("uses only existing geographic landmark associations, without booth GPS or routes", () => {
    const grounds = JSON.parse(readFileSync(new URL("../../../public/data/fair/great-frederick-fair-2026-map.geojson", import.meta.url), "utf8")) as { features: { properties: { id: string } }[] };
    const ids = new Set(grounds.features.map((feature) => feature.properties.id));
    for (const area of fairBoothNeighborhoods) {
      if (area.groundsFeatureId) expect(ids.has(area.groundsFeatureId)).toBe(true);
      expect(area).not.toHaveProperty("latitude");
      expect(area).not.toHaveProperty("longitude");
      expect(area).not.toHaveProperty("route");
    }
  });

  it("keeps structural paths local, finite and identity-safe and omits copied page furniture", () => {
    for (const map of layout.maps) {
      const context = fairBoothMapContexts[map.id];
      expect(new Set(context.paths.map((path) => path.id)).size).toBe(context.paths.length);
      for (const path of context.paths) {
        expect(["building", "road", "boundary"]).toContain(path.kind);
        expect(path.d).toMatch(/^M [\d.,\sMHVLCQZ-]+$/);
        expect(path.d).not.toMatch(/NaN|Infinity|url|https|script/i);
        expect(path.d.match(/-?\d+(?:\.\d+)?/g)?.every((value) => Number.isFinite(Number(value)))).toBe(true);
      }
      const sourceAnnotations = new Set(map.annotations?.map((annotation) => annotation.text));
      for (const label of context.labels) {
        expect(sourceAnnotations.has(label.text)).toBe(false);
        expect(label.text).not.toMatch(/Click to edit|The Great Frederick Fair 2026|Overview|Frederick, Maryland|September 18/);
        expect(label.x).toBeGreaterThanOrEqual(context.bounds.x);
        expect(label.x).toBeLessThanOrEqual(context.bounds.x + context.bounds.width);
        expect(label.y).toBeGreaterThanOrEqual(context.bounds.y);
        expect(label.y).toBeLessThanOrEqual(context.bounds.y + context.bounds.height);
      }
    }
  });
});
