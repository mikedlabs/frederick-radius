import { describe, it, expect, vi } from "vitest";
import {
  getFrederickParks,
  normalizeParks,
} from "@/lib/integrations/fcParks";

// Legacy Colorado ArcGIS fixture shape. These pure-normalizer tests stay useful
// for rejecting out-of-county geometry, but runtime must never query that host.
// Frederick County, Maryland is roughly 39.3-39.7 / -77.7--77.15. GeoJSON
// Polygon coords = [ ring ][ [lng,lat] … ]; MultiPolygon adds one more level.
function squareRing(cx: number, cy: number, r = 0.01) {
  return [[
    [cx - r, cy - r],
    [cx + r, cy - r],
    [cx + r, cy + r],
    [cx - r, cy + r],
    [cx - r, cy - r],
  ]];
}

const raw = {
  type: "FeatureCollection",
  features: [
    {
      geometry: { type: "Polygon", coordinates: squareRing(-77.41, 39.41) },
      properties: {
        OBJECTID: 1,
        Park_name: "Baker Park",
        Type: "COMMUNITY PARK",
        TYPE_2: "PARK",
        Ownership: "CITY",
        Maintained: "CITY OF FREDERICK",
        Acreage: 10,
      },
    },
    // Same park, second polygon — different case/spacing, bigger acreage.
    // Must collapse into ONE park: acres summed (10+30), point + attrs
    // taken from THIS (larger) polygon.
    {
      geometry: { type: "MultiPolygon", coordinates: [squareRing(-77.40, 39.43)] },
      properties: {
        OBJECTID: 2,
        Park_name: "  BAKER  PARK ",
        Type: "REGIONAL PARK",
        TYPE_2: "PARK",
        Ownership: "CITY",
        Maintained: "CITY OF FREDERICK",
        Acreage: 30,
      },
    },
    // A smaller, distinct park — used to assert largest-first ordering.
    {
      geometry: { type: "Polygon", coordinates: squareRing(-77.39, 39.40) },
      properties: {
        OBJECTID: 3,
        Park_name: "Tiny Tot Lot",
        Type: "NEIGHBORHOOD PARK",
        TYPE_2: "PARK",
        Acreage: 2,
      },
    },
    // junk name -> dropped
    {
      geometry: { type: "Polygon", coordinates: squareRing(-77.42, 39.42) },
      properties: { OBJECTID: 4, Park_name: "N/A", Acreage: 5 },
    },
    // nameless -> dropped
    {
      geometry: { type: "Polygon", coordinates: squareRing(-77.42, 39.42) },
      properties: { OBJECTID: 5, Acreage: 9 },
    },
    // out of county (Baltimore) -> dropped
    {
      geometry: { type: "Polygon", coordinates: squareRing(-76.61, 39.29) },
      properties: { OBJECTID: 6, Park_name: "Patterson Park", Acreage: 137 },
    },
    // no geometry -> dropped
    {
      geometry: null,
      properties: { OBJECTID: 7, Park_name: "Ghost Park", Acreage: 4 },
    },
  ],
};

describe("normalizeParks", () => {
  it("uses the reviewed Maryland list without making a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const parks = await getFrederickParks();

    expect(parks.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("keeps in-county named parks, collapsing same-named polygons", () => {
    const out = normalizeParks(raw);
    // Baker (merged) + Tiny Tot Lot. Junk/nameless/out-of-county/no-geom dropped.
    expect(out.map((p) => p.name)).toEqual(["Baker Park", "Tiny Tot Lot"]);

    const baker = out[0];
    expect(baker.acres).toBe(40); // 10 + 30 summed across both polygons
    // Larger (30ac) polygon wins the point + descriptive attributes.
    expect(baker.type).toBe("REGIONAL PARK");
    expect(baker.category).toBe("PARK");
    expect(baker.maintainedBy).toBe("CITY OF FREDERICK");
    expect(baker.lng).toBeCloseTo(-77.40, 2);
    expect(baker.lat).toBeCloseTo(39.43, 2);
    expect(baker.municipality).toBeTruthy();
  });

  it("sorts largest-acreage first", () => {
    const out = normalizeParks(raw);
    expect(out[0].name).toBe("Baker Park"); // 40 ac
    expect(out[1].name).toBe("Tiny Tot Lot"); // 2 ac
  });

  it("drops junk-named, nameless, out-of-county, and geometry-less", () => {
    const names = normalizeParks(raw).map((p) => p.name);
    expect(names).not.toContain("Patterson Park");
    expect(names).not.toContain("Ghost Park");
    expect(names).not.toContain("N/A");
  });

  it("leaves acres undefined when the source acreage is absent or zero", () => {
    const out = normalizeParks({
      features: [
        {
          geometry: { type: "Polygon", coordinates: squareRing(-77.4, 39.4) },
          properties: { Park_name: "Acreless Green" },
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].acres).toBeUndefined();
  });

  it("returns [] for junk input", () => {
    expect(normalizeParks(null)).toEqual([]);
    expect(normalizeParks({})).toEqual([]);
    expect(normalizeParks({ features: "nope" })).toEqual([]);
  });
});
