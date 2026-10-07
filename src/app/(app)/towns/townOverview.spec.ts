import { describe, expect, it } from "vitest";
import { MUNICIPALITIES } from "@/data/municipalities";
import { EMPTY_LINE_FC, type MapLineFC } from "@/components/map/types";
import { townOverview } from "./townOverview";

function squareAround(lng: number, lat: number, d = 0.01) {
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng - d, lat - d],
        [lng + d, lat - d],
        [lng + d, lat + d],
        [lng - d, lat + d],
        [lng - d, lat - d],
      ],
    ],
  };
}

const brunswick = MUNICIPALITIES.find((m) => m.slug === "brunswick")!;
const frederick = MUNICIPALITIES.find((m) => m.slug === "frederick")!;

const BOUNDARIES: MapLineFC = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: squareAround(brunswick.centroid.lng, brunswick.centroid.lat),
      properties: { slug: "brunswick", name: "Brunswick" },
    },
    // The County publishes Frederick in two parts; both are drawn.
    {
      type: "Feature",
      geometry: squareAround(frederick.centroid.lng, frederick.centroid.lat, 0.03),
      properties: { slug: "frederick", name: "Frederick City" },
    },
    {
      type: "Feature",
      geometry: squareAround(frederick.centroid.lng + 0.05, frederick.centroid.lat, 0.01),
      properties: { slug: "frederick", name: "Frederick City" },
    },
    // A name the town list does not know is not drawn.
    {
      type: "Feature",
      geometry: squareAround(-77.4, 39.6),
      properties: { slug: "not-a-town", name: "Elsewhere" },
    },
  ],
};

describe("townOverview", () => {
  it("puts all 13 towns on the map as links, largest first", () => {
    const { points } = townOverview(BOUNDARIES);
    expect(points).toHaveLength(13);
    expect(new Set(points.map((p) => p.id))).toEqual(new Set(MUNICIPALITIES.map((m) => m.slug)));
    expect(points[0].id).toBe("frederick");
    for (const p of points) {
      expect(p.href).toBe(`/m/${p.id}`);
      expect(p.label).toBe(MUNICIPALITIES.find((m) => m.slug === p.id)?.name);
    }
  });

  it("draws official boundaries only, joined per town", () => {
    const { areas, locators } = townOverview(BOUNDARIES);
    expect(areas.map((a) => a.id).sort()).toEqual(["brunswick", "frederick"]);
    expect(areas.find((a) => a.id === "frederick")?.path.match(/M/g)).toHaveLength(2);
    expect(locators.brunswick.path).toMatch(/^M.*Z$/);
    // Urbana is unincorporated: a point, never a guessed outline.
    expect(locators.urbana.path).toBeNull();
  });

  it("still shows every town as a point when the County layer is unavailable", () => {
    const overview = townOverview(EMPTY_LINE_FC);
    expect(overview.areas).toEqual([]);
    expect(overview.points).toHaveLength(13);
    expect(Object.values(overview.locators).every((l) => l.path === null)).toBe(true);
    expect(overview.outline).toMatch(/^M.*Z$/);
    expect(overview.tileOutline.length).toBeLessThan(overview.outline.length / 2);
  });
});
