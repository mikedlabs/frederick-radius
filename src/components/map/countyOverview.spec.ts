import { describe, expect, it } from "vitest";
import COUNTY_OUTLINE from "@/data/county-boundary.json";
import basemapRelease from "@/data/basemap-release.json";
import { MUNICIPALITIES } from "@/data/municipalities";
import {
  COUNTY_EXTENT,
  COUNTY_OVERVIEW_BOUNDS,
  OVERVIEW_ASPECT,
  OVERVIEW_VIEW_HEIGHT,
  OVERVIEW_VIEW_WIDTH,
  layoutOverviewLabels,
  overviewLabelWidth,
  overviewPath,
  projectOverview,
  OVERVIEW_LABEL,
  type OverviewLabelSide,
} from "./countyOverview";

/** MapLibre's normalized Mercator (MercatorCoordinate.fromLngLat), written
 *  out independently so the spec does not reuse the module's own math. */
function mercator(lng: number, lat: number): { x: number; y: number } {
  return {
    x: (180 + lng) / 360,
    y: (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360,
  };
}

const [[west, south], [east, north]] = COUNTY_OVERVIEW_BOUNDS;
const nw = mercator(west, north);
const se = mercator(east, south);

describe("county overview frame", () => {
  it("states the extent of the committed county outline", () => {
    const ring = (COUNTY_OUTLINE as { coordinates: number[][][] }).coordinates[0];
    const lngs = ring.map(([lng]) => lng);
    const lats = ring.map(([, lat]) => lat);
    expect(Math.min(...lngs)).toBeCloseTo(COUNTY_EXTENT[0], 2);
    expect(Math.min(...lats)).toBeCloseTo(COUNTY_EXTENT[1], 2);
    expect(Math.max(...lngs)).toBeCloseTo(COUNTY_EXTENT[2], 2);
    expect(Math.max(...lats)).toBeCloseTo(COUNTY_EXTENT[3], 2);
  });

  it("fits bounds whose Mercator shape matches the square box, so MapLibre's fit has no slack", () => {
    expect(OVERVIEW_ASPECT).toBe(1);
    const width = se.x - nw.x;
    const height = se.y - nw.y;
    expect(width / height).toBeCloseTo(OVERVIEW_ASPECT, 9);
  });

  it("contains the whole county with room to spare", () => {
    const [cw, cs, ce, cn] = COUNTY_EXTENT;
    expect(west).toBeLessThan(cw);
    expect(east).toBeGreaterThan(ce);
    expect(south).toBeLessThan(cs);
    expect(north).toBeGreaterThan(cn);
  });

  it("stays inside the self-hosted tile extract vertically, where the county meets the frame", () => {
    const [, extractSouth, , extractNorth] = basemapRelease.bbox;
    expect(south).toBeGreaterThan(extractSouth);
    expect(north).toBeLessThan(extractNorth);
  });

  it("projects a point to the same place MapLibre draws it after fitting the bounds", () => {
    for (const m of MUNICIPALITIES) {
      const p = mercator(m.centroid.lng, m.centroid.lat);
      const expected = {
        x: ((p.x - nw.x) / (se.x - nw.x)) * OVERVIEW_VIEW_WIDTH,
        y: ((p.y - nw.y) / (se.y - nw.y)) * OVERVIEW_VIEW_HEIGHT,
      };
      const got = projectOverview(m.centroid.lng, m.centroid.lat);
      expect(Math.abs(got.x - expected.x)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(got.y - expected.y)).toBeLessThanOrEqual(0.05);
      expect(got.x).toBeGreaterThan(0);
      expect(got.x).toBeLessThan(OVERVIEW_VIEW_WIDTH);
      expect(got.y).toBeGreaterThan(0);
      expect(got.y).toBeLessThan(OVERVIEW_VIEW_HEIGHT);
    }
  });

  it("maps the frame corners to the view corners", () => {
    expect(projectOverview(west, north)).toEqual({ x: 0, y: 0 });
    expect(projectOverview(east, south)).toEqual({ x: OVERVIEW_VIEW_WIDTH, y: OVERVIEW_VIEW_HEIGHT });
  });
});

describe("overviewPath", () => {
  it("draws the county outline as one closed path in view units", () => {
    const path = overviewPath(COUNTY_OUTLINE);
    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect(path.match(/M/g)).toHaveLength(1);
    const numbers = path.replace(/[MZ]/g, " ").trim().split(/\s+/).map(Number);
    expect(numbers.every((n) => n >= 0 && n <= OVERVIEW_VIEW_WIDTH)).toBe(true);
  });

  it("thins vertices for small tiles without losing the shape", () => {
    const fine = overviewPath(COUNTY_OUTLINE);
    const coarse = overviewPath(COUNTY_OUTLINE, 12);
    expect(fine.length).toBeLessThan(5_000);
    expect(coarse.length).toBeLessThan(fine.length / 2);
    expect(coarse.split(" ").length / 2).toBeGreaterThan(100);
  });

  it("draws every polygon of a MultiPolygon and skips collapsed rings", () => {
    const square = (lng: number, lat: number, d: number) => [
      [lng, lat],
      [lng + d, lat],
      [lng + d, lat + d],
      [lng, lat + d],
      [lng, lat],
    ];
    const path = overviewPath({
      type: "MultiPolygon",
      coordinates: [
        [square(-77.5, 39.4, 0.05)],
        [square(-77.3, 39.5, 0.05)],
        // A sliver far below one view unit collapses and is skipped.
        [square(-77.2, 39.3, 0.000001)],
      ],
    });
    expect(path.match(/M/g)).toHaveLength(2);
  });

  it("returns nothing for unusable geometry", () => {
    expect(overviewPath(null)).toBe("");
    expect(overviewPath({ type: "Point", coordinates: [-77.4, 39.4] })).toBe("");
    expect(overviewPath({ type: "Polygon", coordinates: "nope" })).toBe("");
  });
});

describe("layoutOverviewLabels", () => {
  const towns = [...MUNICIPALITIES]
    .sort((a, b) => b.population - a.population)
    .map((m) => ({ id: m.slug, text: m.name, ...projectOverview(m.centroid.lng, m.centroid.lat) }));

  function rectFor(p: { x: number; y: number; text: string }, side: OverviewLabelSide, width: number) {
    const s = width / OVERVIEW_VIEW_WIDTH;
    const px = p.x * s;
    const py = p.y * s;
    const w = overviewLabelWidth(p.text);
    const h = OVERVIEW_LABEL.height;
    const o = OVERVIEW_LABEL.offset;
    const d = OVERVIEW_LABEL.diagonal;
    const table: Record<OverviewLabelSide, [number, number]> = {
      right: [px + o, py - h / 2],
      left: [px - o - w, py - h / 2],
      above: [px - w / 2, py - o - h],
      below: [px - w / 2, py + o],
      "above-right": [px + d, py - d - h],
      "below-right": [px + d, py + d],
      "above-left": [px - d - w, py - d - h],
      "below-left": [px - d - w, py + d],
    };
    const [left, top] = table[side];
    return { left, top, right: left + w, bottom: top + h };
  }

  it.each([343, 358, 398, 448])("names all 13 towns on a %ipx map", (width) => {
    const sides = layoutOverviewLabels(towns, width);
    expect(Object.values(sides).filter(Boolean)).toHaveLength(13);
  });

  it.each([288, 343, 358, 448])("never stacks labels or lets one leave the %ipx box", (width) => {
    const sides = layoutOverviewLabels(towns, width);
    const rects = towns
      .filter((t) => sides[t.id])
      .map((t) => rectFor(t, sides[t.id]!, width));
    for (const r of rects) {
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(width);
      expect(r.bottom).toBeLessThanOrEqual(width / OVERVIEW_ASPECT);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        expect(apart).toBe(true);
      }
    }
  });

  it("keeps the largest towns labeled when a narrow map cannot fit every name", () => {
    const sides = layoutOverviewLabels(towns, 288);
    const placed = Object.values(sides).filter(Boolean).length;
    expect(placed).toBeGreaterThanOrEqual(11);
    expect(sides.frederick).not.toBeNull();
  });

  it("drops the lowest-priority label when there is no room, instead of overlapping", () => {
    // In a 120px box a 63px label fits only above or below a centered point,
    // so three labels on one point leave room for two.
    const sides = layoutOverviewLabels(
      [
        { id: "a", x: 500, y: 500, text: "Abcdefgh" },
        { id: "b", x: 500, y: 500, text: "Bcdefghi" },
        { id: "c", x: 500, y: 500, text: "Cdefghij" },
        { id: "d", x: 100, y: 900, text: null },
      ],
      120,
    );
    expect(new Set([sides.a, sides.b])).toEqual(new Set(["above", "below"]));
    expect(sides.c).toBeNull();
    expect(sides.d).toBeNull();
  });
});
