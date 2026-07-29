import { describe, expect, it } from "vitest";
import type { Amenity } from "@/lib/loaders/amenities";
import {
  HOURS_REFRESH_CYCLE_DAYS,
  hoursRefreshCycleDay,
} from "@/lib/hours-refresh-targets";
import {
  summarizeAmenityCoverage,
  summarizeEventQuality,
  summarizeHoursRefreshArtifact,
} from "./operator-coverage";

function slugForCycleDay(cycleDay: number): string {
  for (let index = 0; index < 1_000; index++) {
    const slug = `coverage-cycle-${cycleDay}-${index}`;
    if (hoursRefreshCycleDay(slug) === cycleDay) return slug;
  }
  throw new Error(`Unable to find a slug for cycle day ${cycleDay}.`);
}

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
          weekday_hours: ["Monday: 24 hours"],
          refreshed_at: "2026-07-26T11:00:00Z",
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
      freshRefreshRows: 1,
      freshRows: 1,
      staleRows: 0,
      invalidTimestamps: 0,
      coveragePct: 50,
      oldestRefresh: "2026-07-25T12:00:00.000Z",
      newestRefresh: "2026-07-25T12:00:00.000Z",
    });
  });

  it("does not let unmatched hours rows inflate or distort coverage", () => {
    const summary = summarizeHoursRefreshArtifact(
      {
        expected_stale: {
          weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
          refreshed_at: "2026-06-01T12:00:00Z",
        },
        expected_invalid: {
          weekday_hours: [],
          refreshed_at: "not-a-date",
        },
        orphan_fresh: {
          weekday_hours: ["Monday: 24 hours"],
          refreshed_at: "2026-07-26T11:00:00Z",
        },
      },
      new Set(["expected_stale", "expected_invalid", "missing"]),
      new Date("2026-07-26T12:00:00Z"),
    );

    expect(summary).toMatchObject({
      expectedGoogleBackedPlaces: 3,
      rows: 3,
      matchedRows: 2,
      unmatchedRows: 1,
      withSchedule: 1,
      freshRefreshRows: 0,
      freshRows: 0,
      staleRows: 1,
      invalidTimestamps: 1,
      coveragePct: 0,
      oldestRefresh: "2026-06-01T12:00:00.000Z",
      newestRefresh: "2026-06-01T12:00:00.000Z",
      cycle: {
        state: "stalled",
      },
    });
  });

  it("does not count a fresh business-status-only row as fresh hours", () => {
    const summary = summarizeHoursRefreshArtifact(
      {
        status_only: {
          business_status: "OPERATIONAL",
          refreshed_at: "2026-07-26T11:00:00Z",
        },
      },
      new Set(["status_only"]),
      new Date("2026-07-26T12:00:00Z"),
    );

    expect(summary).toMatchObject({
      matchedRows: 1,
      withSchedule: 0,
      freshRefreshRows: 1,
      freshRows: 0,
      staleRows: 0,
      coveragePct: 0,
    });
  });

  it("shows whether the deterministic hours cycle is warming, healthy, or stalled", () => {
    const slugs = Array.from({ length: HOURS_REFRESH_CYCLE_DAYS }, (_, cycleDay) =>
      slugForCycleDay(cycleDay),
    );
    const missingCycleDays = Array.from(
      { length: HOURS_REFRESH_CYCLE_DAYS - 1 },
      (_, index) => index + 1,
    );
    const expected = new Set(slugs);
    const now = new Date("2026-07-28T12:00:00Z");
    const freshArtifact = Object.fromEntries(
      slugs.map((slug, cycleDay) => [
        slug,
        {
          weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
          refreshed_at: new Date(
            now.getTime() - cycleDay * 86_400_000,
          ).toISOString(),
        },
      ]),
    );

    const healthy = summarizeHoursRefreshArtifact(
      freshArtifact,
      expected,
      now,
    );
    expect(healthy.cycle).toMatchObject({
      days: HOURS_REFRESH_CYCLE_DAYS,
      state: "healthy",
      completedDays: HOURS_REFRESH_CYCLE_DAYS,
      missingDays: [],
      underfilledDays: [],
      refreshCoveragePct: 100,
    });
    expect(healthy.cycle.buckets).toHaveLength(HOURS_REFRESH_CYCLE_DAYS);
    expect(
      healthy.cycle.buckets.every(
        (bucket) =>
          bucket.expected === 1 &&
          bucket.refreshed === 1 &&
          bucket.withSchedule === 1 &&
          bucket.complete,
      ),
    ).toBe(true);

    const warming = summarizeHoursRefreshArtifact(
      {
        [slugs[0]]: {
          business_status: "OPERATIONAL",
          refreshed_at: now.toISOString(),
        },
      },
      expected,
      now,
    );
    expect(warming.cycle).toMatchObject({
      state: "warming",
      completedDays: 1,
      missingDays: missingCycleDays,
      refreshCoveragePct:
        Math.round((100 / HOURS_REFRESH_CYCLE_DAYS) * 10) / 10,
    });
    expect(warming.freshRefreshRows).toBe(1);
    expect(warming.freshRows).toBe(0);

    const stalled = summarizeHoursRefreshArtifact(
      {
        [slugs[0]]: {
          weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
          refreshed_at: new Date(
            now.getTime() -
              (HOURS_REFRESH_CYCLE_DAYS - 1) * 86_400_000,
          ).toISOString(),
        },
      },
      expected,
      now,
    );
    expect(stalled.cycle).toMatchObject({
      state: "stalled",
      completedDays: 1,
      missingDays: missingCycleDays,
    });
  });

  it("marks a partially written cycle bucket as underfilled", () => {
    const dayZeroSlugs = Array.from(
      { length: 1_000 },
      (_, index) => `coverage-cycle-underfilled-${index}`,
    )
      .filter((slug) => hoursRefreshCycleDay(slug) === 0)
      .slice(0, 3);
    if (dayZeroSlugs.length !== 3) {
      throw new Error("Unable to find three day-zero slugs.");
    }

    const summary = summarizeHoursRefreshArtifact(
      {
        [dayZeroSlugs[0]]: {
          weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
          refreshed_at: "2026-07-28T11:00:00Z",
        },
      },
      new Set(dayZeroSlugs),
      new Date("2026-07-28T12:00:00Z"),
    );

    expect(summary.cycle.buckets[0]).toMatchObject({
      expected: 3,
      refreshed: 1,
      complete: false,
    });
    expect(summary.cycle.underfilledDays).toContain(0);
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
