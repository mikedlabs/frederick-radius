import { describe, expect, it } from "vitest";
import {
  countyParksOverlayGeoJson,
  countyPlanningOverlayGeoJson,
} from "./countyOverlayGeoJson";

describe("county parks overlay GeoJSON", () => {
  it("ships only the small public map contract", () => {
    const collection = countyParksOverlayGeoJson([
      {
        name: "  Baker Park  ",
        address: "121 N Bentz St",
        municipality: "Frederick",
        lng: -77.417,
        lat: 39.418,
      },
      {
        name: "Bad coordinate",
        lng: Number.NaN,
        lat: 39.4,
      },
    ]);

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]).toMatchObject({
      geometry: { type: "Point", coordinates: [-77.417, 39.418] },
      properties: {
        name: "Baker Park",
        address: "121 N Bentz St",
        municipality: "Frederick",
        source_label: "Frederick County Government",
        caveat: expect.stringContaining("does not confirm"),
      },
    });
    expect(Object.keys(collection.features[0].properties).sort()).toEqual([
      "address",
      "caveat",
      "id",
      "municipality",
      "name",
      "source_label",
      "source_url",
    ]);
  });
});

describe("county planning overlay GeoJSON", () => {
  it("keeps proposal status explicit and never implies construction", () => {
    const collection = countyPlanningOverlayGeoJson(
      [{
        id: "fc-planning-42",
        name: "Brickworks",
        applicationType: "Site plan",
        permitId: "SP123",
        detailsUrl:
          "https://planningandpermitting.frederickcountymd.gov/record/123",
        milestone: "Awaiting applicant revisions",
        milestoneAt: "2026-07-01T00:00:00.000Z",
        lifecycle: "open_application",
        constructionStatus: "not_established",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-77.42, 39.41],
              [-77.41, 39.41],
              [-77.41, 39.42],
              [-77.42, 39.41],
            ],
          ],
        },
      }],
      { checkedAt: "2026-08-11T18:30:00.000Z" },
    );

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties).toMatchObject({
      name: "Brickworks",
      status_label: "Open application",
      lifecycle: "open_application",
      construction_status: "not_established",
      application_type: "Site plan",
      milestone: "Awaiting applicant revisions",
      checked_at: "2026-08-11T18:30:00.000Z",
      caveat: expect.stringContaining("not evidence of approval"),
    });
    const publicBody = JSON.stringify(collection);
    expect(publicBody).not.toContain("under construction");
    expect(publicBody).not.toContain("approved");
  });

  it("drops anything that is not explicitly an open application", () => {
    const collection = countyPlanningOverlayGeoJson([
      {
        id: "fc-planning-99",
        name: "Invalid lifecycle",
        lifecycle: "approved" as "open_application",
        constructionStatus: "not_established",
        geometry: { type: "Polygon", coordinates: [] },
      },
    ]);
    expect(collection.features).toEqual([]);
  });
});
