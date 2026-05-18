import { describe, it, expect } from "vitest";
import {
  normalizeParkLocations,
  enrichParksWithLocations,
  normParkName,
} from "@/lib/integrations/fcParkLocations";

// Real ArcGIS field names + shape (confirmed live against
// Park_Locations/MapServer/0). f=geojson Point geometry = [lng, lat];
// Frederick County ~39.3-39.7 / -77.7--77.15.
const raw = {
  type: "FeatureCollection",
  features: [
    {
      geometry: { type: "Point", coordinates: [-77.45, 39.42] },
      properties: {
        OBJECTID: 1,
        PARK_NAME: "Bulrush Wetland Park",
        ADDRESS: "6140 Wetland Park Dr",
        TYPE: "Natural Area",
        AMENITIES:
          "http://www.frederickco.gov/Facilities/Facility/Details/Bulrush-Wetland-Park-6",
      },
    },
    {
      geometry: { type: "Point", coordinates: [-77.46, 39.41] },
      properties: {
        OBJECTID: 5,
        PARK_NAME: "Bella Rosa Golf Course",
        ADDRESS: "5830 Bella Rosa Pkway",
        TYPE: "Golf Course",
        AMENITIES: "https://www.bellarosagolf.com/", // external url kept
      },
    },
    {
      geometry: { type: "Point", coordinates: [-77.4, 39.4] },
      properties: {
        OBJECTID: 6,
        PARK_NAME: "Clark Ranch Park",
        ADDRESS: "7118 Caleb Ave",
        TYPE: "Mini Park",
        AMENITIES: "Not provided", // not http -> detailsUrl undefined
      },
    },
    // nameless -> dropped
    { geometry: { type: "Point", coordinates: [-77.4, 39.4] }, properties: { OBJECTID: 7 } },
    // non-point -> dropped
    {
      geometry: { type: "Polygon", coordinates: [[[-77.4, 39.4]]] },
      properties: { OBJECTID: 8, PARK_NAME: "Polygon Park" },
    },
    // out of county -> dropped
    {
      geometry: { type: "Point", coordinates: [-76.61, 39.29] },
      properties: { OBJECTID: 9, PARK_NAME: "Patterson Park" },
    },
    // duplicate OBJECTID 1 -> deduped
    {
      geometry: { type: "Point", coordinates: [-77.45, 39.42] },
      properties: { OBJECTID: 1, PARK_NAME: "Bulrush Wetland Park (dupe)" },
    },
  ],
};

describe("normParkName", () => {
  it("uppercases and keeps only alphanumerics", () => {
    expect(normParkName("St. John's Park!")).toBe("STJOHNSPARK");
    expect(normParkName("  baker   park  ")).toBe("BAKERPARK");
  });
});

describe("normalizeParkLocations", () => {
  it("keeps in-county named points; detailsUrl only when a real http url", () => {
    const out = normalizeParkLocations(raw);
    expect(out.map((p) => p.name)).toEqual([
      "Bulrush Wetland Park",
      "Bella Rosa Golf Course",
      "Clark Ranch Park",
    ]);
    const bul = out[0];
    expect(bul.address).toBe("6140 Wetland Park Dr");
    expect(bul.type).toBe("Natural Area");
    expect(bul.norm).toBe("BULRUSHWETLANDPARK");
    expect(bul.detailsUrl).toContain("frederickco.gov/Facilities");
    expect(out[1].detailsUrl).toBe("https://www.bellarosagolf.com/"); // external kept
    expect(out[2].detailsUrl).toBeUndefined(); // "Not provided"
  });

  it("drops nameless, non-point, out-of-county; dedupes by OBJECTID", () => {
    const names = normalizeParkLocations(raw).map((p) => p.name);
    expect(names).not.toContain("Polygon Park");
    expect(names).not.toContain("Patterson Park");
    expect(names).not.toContain("Bulrush Wetland Park (dupe)");
  });

  it("returns [] for junk input", () => {
    expect(normalizeParkLocations(null)).toEqual([]);
    expect(normalizeParkLocations({})).toEqual([]);
    expect(normalizeParkLocations({ features: "nope" })).toEqual([]);
  });
});

describe("enrichParksWithLocations", () => {
  const locs = normalizeParkLocations(raw);

  it("attaches address/detailsUrl and prefers the cleaner type on an exact name match", () => {
    const [p] = enrichParksWithLocations(
      [{ name: "BULRUSH WETLAND PARK", type: "LANDSCAPE" }],
      locs,
    );
    expect(p.address).toBe("6140 Wetland Park Dr");
    expect(p.detailsUrl).toContain("frederickco.gov/Facilities");
    expect(p.type).toBe("Natural Area"); // location type preferred
  });

  it("matches via the symmetric trailing-PARK strip ('Clark Ranch' <-> 'Clark Ranch Park')", () => {
    const [p] = enrichParksWithLocations([{ name: "Clark Ranch" }], locs);
    expect(p.address).toBe("7118 Caleb Ave");
    expect(p.detailsUrl).toBeUndefined(); // loc had "Not provided"
    expect(p.type).toBe("Mini Park");
  });

  it("never overwrites an existing value and leaves unmatched parks untouched", () => {
    const out = enrichParksWithLocations(
      [
        { name: "Bulrush Wetland Park", address: "Existing Addr" },
        { name: "Totally Unknown Green", type: "PARK" },
      ],
      locs,
    );
    expect(out[0].address).toBe("Existing Addr"); // not clobbered
    expect(out[1].address).toBeUndefined(); // no match -> unchanged
    expect(out[1].type).toBe("PARK");
  });

  it("is identity when there are no locations", () => {
    const parks = [{ name: "Baker Park", type: "COMMUNITY PARK" }];
    expect(enrichParksWithLocations(parks, [])).toEqual(parks);
  });
});
