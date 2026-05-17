import { describe, it, expect } from "vitest";
import { parcelContextFor, type ParcelFeatureCollection } from "@/lib/loaders/cofParcels";

// Fixture, no live City data. A square parcel with a square hole, plus
// a separate MultiPolygon parcel, so point in polygon, hole exclusion,
// and MultiPolygon are all exercised deterministically.
const square = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

const fc: ParcelFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          square(-77.42, 39.4, -77.4, 39.42), // outer ring
          square(-77.412, 39.409, -77.408, 39.411), // hole
        ],
      },
      properties: {
        parcel_id: "ACCT-1",
        address: { street: "1 Test St", city: "Frederick", state: "MD", zip: "" },
        zoning: "DB",
        zoning_overlays: ["HPO"],
        land_use: "Commercial",
        subdivision: "Downtown",
        neighborhood_advisory_council: "NAC 1",
        election_district: 3,
        schools: { elementary: "Parkway", middle: "West", high: "FHS" },
      },
    },
    {
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: [[square(-77.5, 39.5, -77.49, 39.51)]],
      },
      properties: {
        parcel_id: "ACCT-2",
        address: { street: "2 Far Rd", city: "Frederick", state: "MD", zip: "" },
        zoning_overlays: [],
        schools: {},
      },
    },
  ],
};

describe("parcelContextFor", () => {
  it("returns the parcel that contains the point", () => {
    const ctx = parcelContextFor(fc, -77.405, 39.405);
    expect(ctx?.parcel_id).toBe("ACCT-1");
    expect(ctx?.zoning).toBe("DB");
    expect(ctx?.schools.high).toBe("FHS");
  });

  it("excludes a point that falls inside a hole", () => {
    expect(parcelContextFor(fc, -77.41, 39.41)).toBeNull();
  });

  it("matches a MultiPolygon parcel", () => {
    expect(parcelContextFor(fc, -77.495, 39.505)?.parcel_id).toBe("ACCT-2");
  });

  it("returns null when no parcel contains the point", () => {
    expect(parcelContextFor(fc, -76.0, 39.0)).toBeNull();
  });
});
