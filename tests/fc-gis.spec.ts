import { describe, it, expect } from "vitest";
import {
  normalizeMunicipalBoundaries,
  normalizeCountyParks,
} from "@/lib/integrations/fcGis";

describe("normalizeMunicipalBoundaries", () => {
  const raw = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[[-77.4, 39.4], [-77.39, 39.4], [-77.39, 39.41], [-77.4, 39.4]]] },
        properties: { MUNIC: "New Market", ACRES: 1111 },
      },
      {
        type: "Feature",
        geometry: { type: "MultiPolygon", coordinates: [[[[-77.5, 39.3], [-77.49, 39.3], [-77.49, 39.31], [-77.5, 39.3]]]] },
        properties: { MUNIC: "Brunswick" },
      },
      // a stray point — dropped
      { type: "Feature", geometry: { type: "Point", coordinates: [-77.4, 39.4] }, properties: { MUNIC: "Nope" } },
    ],
  };

  it("keeps polygons + multipolygons with canonical app identities", () => {
    const fc = normalizeMunicipalBoundaries(raw);
    expect(fc.features).toHaveLength(2);
    expect(fc.features.map((f) => f.properties.name)).toEqual(["New Market", "Brunswick"]);
    expect(fc.features[0].properties).toEqual({
      name: "New Market",
      slug: "new-market",
      sourceName: "New Market",
    });
  });

  it("returns empty FC for junk", () => {
    expect(normalizeMunicipalBoundaries(null).features).toEqual([]);
    expect(normalizeMunicipalBoundaries({}).features).toEqual([]);
    expect(normalizeMunicipalBoundaries({ features: 5 }).features).toEqual([]);
  });
});

describe("normalizeCountyParks", () => {
  const raw = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-77.41, 39.41] },
        properties: { Name: "Baker Park", Address: "121 N Bentz St", CityMuni: "Frederick" },
      },
      // nameless — dropped
      { type: "Feature", geometry: { type: "Point", coordinates: [-77.4, 39.4] }, properties: { Name: "" } },
      // out of county (Baltimore) — dropped
      { type: "Feature", geometry: { type: "Point", coordinates: [-76.6, 39.29] }, properties: { Name: "Far Park" } },
      // polygon — dropped (parks point layer should be points)
      { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: { Name: "Poly Park" } },
    ],
  };

  it("keeps in-county named points with address + municipality", () => {
    const out = normalizeCountyParks(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: "Baker Park",
      address: "121 N Bentz St",
      municipality: "Frederick",
      lng: -77.41,
      lat: 39.41,
    });
  });

  it("returns [] for junk", () => {
    expect(normalizeCountyParks(null)).toEqual([]);
    expect(normalizeCountyParks({ features: "no" })).toEqual([]);
  });
});
