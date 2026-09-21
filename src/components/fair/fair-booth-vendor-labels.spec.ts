import { describe, expect, it } from "vitest";
import { boxesOverlap, layoutFairVendorLabels } from "./fair-booth-vendor-labels";
import { fairBoothFixture } from "./fair-booth-fixture";
import realLayout from "../../../public/fair/layouts/great-frederick-fair-2026.json";
import { fairBoothNeighborhoods } from "@/data/fair/fair-booth-context";
import { boothViewBox, fitBoothCamera } from "./fair-booth-camera";

const base = { booths: fairBoothFixture.maps[2].booths, vendors: fairBoothFixture.vendors, viewBox: { x: 0, y: 0, width: 1000, height: 900 }, viewport: { width: 800, height: 720 }, selectedBoothId: null, highlightedIds: new Set<string>() };

describe("Fair vendor map labels", () => {
  it("labels each vendor once, never turns unassigned booths into vendors", () => {
    const labels = layoutFairVendorLabels(base);
    expect(labels).toHaveLength(1);
    expect(labels[0].name).toBe("White Rabbit x Rad Pies");
    expect(labels[0].boothId).not.toBe("3:7");
    expect(labels[0].height).toBe(44);
  });

  it("anchors the selected booth and honors top-left source rotation", () => {
    const booth = { ...base.booths[0], x: 300, y: 300, width: 100, height: 40, rotationDeg: 90 };
    const labels = layoutFairVendorLabels({ ...base, booths: [booth], selectedBoothId: booth.id });
    expect(labels[0].selected).toBe(true);
    expect(labels[0].anchorX).toBeCloseTo(224);
    expect(labels[0].anchorY).toBeCloseTo(280);
  });

  it("does not attach a label to an offscreen booth", () => {
    expect(layoutFairVendorLabels({ ...base, viewBox: { x: 0, y: 0, width: 100, height: 90 } })).toEqual([]);
  });

  for (const width of [296, 351, 366, 406, 800]) {
    it(`keeps real source-area labels readable and collision-free at ${width}px`, () => {
      const viewport = { width, height: width < 500 ? 330 : 560 };
      for (const area of fairBoothNeighborhoods) {
        const source = realLayout.maps.find((map) => map.id === area.mapId)!;
        const labels = layoutFairVendorLabels({ booths: source.booths.filter((booth) => area.boothIds.includes(booth.id)), vendors: realLayout.vendors, viewBox: boothViewBox(area.bounds, viewport, fitBoothCamera(area.bounds)), viewport, selectedBoothId: null, highlightedIds: new Set() });
        expect(labels.length).toBeGreaterThan(0);
        if (area.id === "west-end") expect(labels.some((label) => label.name === "White Rabbit x Rad Pies")).toBe(true);
        expect(labels.length).toBeLessThanOrEqual(width < 500 ? 5 : 10);
        for (let i = 0; i < labels.length; i++) {
          expect(labels[i].x).toBeGreaterThanOrEqual(8);
          expect(labels[i].x + labels[i].width).toBeLessThanOrEqual(width - 8);
          expect(labels[i].height).toBe(44);
          for (let j = i + 1; j < labels.length; j++) expect(boxesOverlap(labels[i], labels[j])).toBe(false);
        }
      }
    });
  }
});
