import { describe, expect, it } from "vitest";
import {
  buildPublicMapDiscrepancyReport,
  normalizeGisFeature,
  normalizeOsmAmenityFeature,
  normalizeOverturePlaceFeature,
  osmSourceRefFromRadiusAmenityId,
  publicMapSourceRef,
  type PublicMapCandidate,
  type RadiusMapEntity,
} from "@/lib/quality/public-map-discrepancies";

const BRUNSWICK = { lng: -77.6289, lat: 39.3143 };

function candidate(overrides: Partial<PublicMapCandidate> = {}): PublicMapCandidate {
  return {
    source: "overture",
    sourceId: "gers-new",
    entityKind: "place",
    name: "New Brunswick Bakery",
    category: "bakery",
    ...BRUNSWICK,
    ...overrides,
  };
}

function radius(overrides: Partial<RadiusMapEntity> = {}): RadiusMapEntity {
  return {
    id: "new-brunswick-bakery",
    entityKind: "place",
    name: "New Brunswick Bakery",
    ...BRUNSWICK,
    ...overrides,
  };
}

describe("public map discrepancy review policy", () => {
  it("creates a candidate-only missing queue without publishing", () => {
    const report = buildPublicMapDiscrepancyReport(
      [candidate()],
      [],
      "2026-08-22T12:00:00.000Z",
    );
    expect(report).toMatchObject({
      kind: "candidate-only",
      autoPublish: false,
      scanned: 1,
      summary: { likelyMissing: 1, possibleStale: 0, identityDrift: 0 },
    });
    expect(report.candidates[0]).toMatchObject({
      kind: "likely_missing",
      reviewState: "candidate",
      sourceRef: "overture:gers-new",
    });
  });

  it("does not flag a source omission as stale", () => {
    const report = buildPublicMapDiscrepancyReport([], [radius()]);
    expect(report.summary.possibleStale).toBe(0);
    expect(report.candidates).toEqual([]);
  });

  it("requires an explicit terminal status and a strong place match for stale", () => {
    const report = buildPublicMapDiscrepancyReport(
      [candidate({ status: "closed_permanently" })],
      [radius()],
    );
    expect(report.candidates[0]).toMatchObject({
      kind: "possible_stale",
      confidence: "medium",
      radiusId: "new-brunswick-bakery",
      matchedBy: "name_and_location",
    });
  });

  it("ignores a terminal source row that cannot be tied to Radius", () => {
    const report = buildPublicMapDiscrepancyReport(
      [candidate({ name: "Unmatched Closed Place", status: "retired" })],
      [radius()],
    );
    expect(report.candidates).toEqual([]);
    expect(report.ignored).toBe(1);
  });

  it("uses source identity before proximity for amenity drift", () => {
    const sourceRef = publicMapSourceRef("osm", "node/42");
    const report = buildPublicMapDiscrepancyReport(
      [candidate({
        source: "osm",
        sourceId: "node/42",
        entityKind: "amenity",
        name: "Baker Park bottle fill",
        amenityKind: "water",
      })],
      [radius({
        id: "water-node-42",
        entityKind: "amenity",
        name: "Old bottle fill label",
        amenityKind: "water",
        sourceRefs: [sourceRef],
      })],
    );
    expect(report.candidates[0]).toMatchObject({
      kind: "identity_drift",
      confidence: "high",
      matchedBy: "source_ref",
      radiusId: "water-node-42",
    });
  });

  it("does not collapse two functions carried by one OSM object", () => {
    const sourceRef = publicMapSourceRef("osm", "node/42");
    const report = buildPublicMapDiscrepancyReport(
      [
        candidate({
          source: "osm",
          sourceId: "node/42",
          entityKind: "amenity",
          name: "Public restroom",
          amenityKind: "restroom",
        }),
        candidate({
          source: "osm",
          sourceId: "node/42",
          entityKind: "amenity",
          name: "Drinking water",
          amenityKind: "water",
        }),
      ],
      [radius({
        id: "water-node-42",
        entityKind: "amenity",
        name: "Drinking water",
        amenityKind: "water",
        sourceRefs: [sourceRef],
      })],
    );
    expect(report.summary.likelyMissing).toBe(1);
    expect(report.candidates[0]).toMatchObject({
      kind: "likely_missing",
      amenityKind: "restroom",
    });
  });

  it("does not call a nearby different amenity stale without a source identity", () => {
    const report = buildPublicMapDiscrepancyReport(
      [candidate({
        source: "osm",
        sourceId: "node/43",
        entityKind: "amenity",
        name: "Closed bin",
        amenityKind: "trash",
        status: "removed",
      })],
      [radius({
        id: "trash-node-44",
        entityKind: "amenity",
        name: "Trash receptacle",
        amenityKind: "trash",
        sourceRefs: [publicMapSourceRef("osm", "node/44")],
      })],
    );
    expect(report.candidates).toEqual([]);
  });
});

describe("public map source normalization", () => {
  it("normalizes OSM amenity identity and keeps a direct evidence URL", () => {
    const value = normalizeOsmAmenityFeature({
      geometry: { type: "Point", coordinates: [BRUNSWICK.lng, BRUNSWICK.lat] },
      properties: {
        amenity: "drinking_water",
        name: "Canal bottle fill",
        _osm_type: "node",
        _osm_id: 42,
      },
    });
    expect(value).toMatchObject({
      sourceId: "n/42",
      amenityKind: "water",
      sourceUrl: "https://www.openstreetmap.org/node/42",
    });
    expect(osmSourceRefFromRadiusAmenityId("water-node-42")).toBe("osm:n:42");
  });

  it("excludes customer-only OSM amenities from the actionable queue", () => {
    const value = normalizeOsmAmenityFeature({
      geometry: { type: "Point", coordinates: [BRUNSWICK.lng, BRUNSWICK.lat] },
      properties: {
        amenity: "charging_station",
        access: "customers",
        _osm_type: "n",
        _osm_id: "7",
      },
    });
    const report = buildPublicMapDiscrepancyReport(value ? [value] : [], []);
    expect(report.candidates).toEqual([]);
    expect(report.ignored).toBe(1);
  });

  it("normalizes an Overture place without retaining the raw feature", () => {
    const value = normalizeOverturePlaceFeature({
      geometry: { type: "Point", coordinates: [BRUNSWICK.lng, BRUNSWICK.lat] },
      properties: {
        id: "gers-1",
        names: { primary: "Beans in the Belfry" },
        categories: { primary: "cafe" },
        addresses: [{ freeform: "122 W Potomac St, Brunswick" }],
      },
    });
    expect(value).toMatchObject({
      source: "overture",
      sourceId: "gers-1",
      name: "Beans in the Belfry",
      category: "cafe",
    });
    expect(value).not.toHaveProperty("properties");
  });

  it("requires an explicit GIS entity type and maps inactive records safely", () => {
    const value = normalizeGisFeature({
      geometry: { type: "Point", coordinates: [BRUNSWICK.lng, BRUNSWICK.lat] },
      properties: { OBJECTID: 9, NAME: "Public fountain", ACTIVE: 0 },
    }, { entityKind: "amenity", amenityKind: "water" });
    expect(value).toMatchObject({
      source: "gis",
      sourceId: "9",
      entityKind: "amenity",
      amenityKind: "water",
      status: "inactive",
    });
  });
});
