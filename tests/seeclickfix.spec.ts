import { describe, it, expect } from "vitest";
import { inFrederickBbox, filterToCounty } from "@/lib/integrations/seeclickfix";

// The exact failure the external audit caught: SeeClickFix v2 ignores
// a bbox-only query and returns the global recent feed, so /pulse
// rendered these cities under a "Frederick County" header.
const FAR_AWAY = [
  { city: "Las Vegas", lat: 36.1699, lng: -115.1398 },
  { city: "Toledo", lat: 41.6639, lng: -83.5552 },
  { city: "Tacoma", lat: 47.2529, lng: -122.4443 },
  { city: "Orlando", lat: 28.5383, lng: -81.3792 },
  { city: "Birmingham", lat: 33.5186, lng: -86.8104 },
  { city: "Kingsport", lat: 36.5484, lng: -82.5618 },
  { city: "Watertown MA", lat: 42.3709, lng: -71.1828 },
  { city: "Oakland", lat: 37.8044, lng: -122.2712 },
];

const FREDERICK = { city: "Frederick MD", lat: 39.4143, lng: -77.4105 };

describe("inFrederickBbox", () => {
  it("accepts a downtown Frederick point", () => {
    expect(inFrederickBbox(FREDERICK.lat, FREDERICK.lng)).toBe(true);
  });
  it("rejects every far-away city the audit cited", () => {
    for (const p of FAR_AWAY) {
      expect(inFrederickBbox(p.lat, p.lng), p.city).toBe(false);
    }
  });
  it("rejects non-finite coordinates", () => {
    expect(inFrederickBbox(NaN, -77.4)).toBe(false);
    expect(inFrederickBbox(39.4, Infinity)).toBe(false);
  });
  it("is inclusive on the bbox edges, exclusive just outside", () => {
    expect(inFrederickBbox(39.265, -77.7)).toBe(true); // SW corner
    expect(inFrederickBbox(39.745, -77.15)).toBe(true); // NE corner
    expect(inFrederickBbox(39.2649, -77.41)).toBe(false); // just south
    expect(inFrederickBbox(39.41, -77.1499)).toBe(false); // just east
  });
});

describe("filterToCounty — the belt-and-suspenders post-filter", () => {
  it("keeps ONLY the Frederick issue out of a global feed", () => {
    const feed = [
      ...FAR_AWAY.map((p, i) => ({ id: i, lat: p.lat, lng: p.lng })),
      { id: 99, lat: FREDERICK.lat, lng: FREDERICK.lng },
    ];
    const kept = filterToCounty(feed);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe(99);
  });
  it("returns an empty array when nothing is in county", () => {
    expect(filterToCounty(FAR_AWAY.map((p) => ({ ...p })))).toEqual([]);
  });
});
