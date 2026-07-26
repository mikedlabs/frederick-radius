import { describe, expect, it } from "vitest";
import type { Amenity } from "@/lib/loaders/amenities";
import {
  summarizeAmenityCoverage,
  summarizeEventQuality,
  summarizeHoursRefreshArtifact,
} from "./operator-coverage";

describe("operator data coverage", () => {
  it("separates an empty hours artifact from stored source schedules", () => {
    const expected = new Set(["one", "two"]);
    expect(
      summarizeHoursRefreshArtifact(
        { _doc: "metadata only" },
        expected,
        new Date("2026-07-26T12:00:00Z"),
      ),
    ).toMatchObject({
      expectedGoogleBackedPlaces: 2,
      rows: 0,
      freshRows: 0,
      coveragePct: 0,
    });

    const summary = summarizeHoursRefreshArtifact(
      {
        _doc: "ignored",
        one: {
          weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
          refreshed_at: "2026-07-25T12:00:00Z",
        },
        orphan: {
          weekday_hours: [],
          refreshed_at: "not-a-date",
        },
      },
      expected,
      new Date("2026-07-26T12:00:00Z"),
    );
    expect(summary).toMatchObject({
      rows: 2,
      matchedRows: 1,
      unmatchedRows: 1,
      withSchedule: 1,
      freshRows: 1,
      invalidTimestamps: 1,
      coveragePct: 50,
    });
  });

  it("makes event category, venue, centroid, and duration gaps explicit", () => {
    const summary = summarizeEventQuality([
      {
        slug: "good",
        category: "music",
        venue_name: "Weinberg Center",
        venue_place_slug: "weinberg",
        starts_at: "2026-08-01T22:00:00Z",
        ends_at: "2026-08-02T00:00:00Z",
        placement: "venue",
        geom: { lng: -77.41, lat: 39.414 },
      },
      {
        slug: "review",
        category: "other",
        starts_at: "2026-08-01T22:00:00Z",
        ends_at: "2026-08-01T22:00:00Z",
        placement: "geocoded",
        geom: { lng: -77.4109, lat: 39.4137 },
      },
    ]);

    expect(summary).toMatchObject({
      total: 2,
      placeholderCategory: 1,
      missingVenueName: 1,
      unresolvedVenueJoin: 1,
      areaCentroid: 1,
      zeroDuration: 1,
    });
  });

  it("shows static and approved field amenity coverage separately by town", () => {
    const points: Amenity[] = [
      {
        id: "water-1",
        kind: "water",
        name: "Water",
        municipality: "frederick",
        lng: -77.41,
        lat: 39.41,
      },
      {
        id: "field:trash-1",
        kind: "trash",
        name: "Trash",
        municipality: "frederick",
        lng: -77.4101,
        lat: 39.4101,
        photo: "https://example.com/trash.jpg",
      },
    ];
    const summary = summarizeAmenityCoverage(points, [
      "frederick",
      "urbana",
    ]);

    expect(summary).toMatchObject({
      total: 2,
      staticPoints: 1,
      fieldPoints: 1,
      withFieldPhoto: 1,
    });
    expect(summary.byTownKind.frederick.water).toBe(1);
    expect(summary.fieldByTownKind.frederick.trash).toBe(1);
    expect(summary.emptyCoreCells).toContainEqual({
      town: "urbana",
      kind: "restroom",
    });
  });
});
