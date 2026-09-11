import { describe, expect, it } from "vitest";
import REFRESH_IDENTITIES_RAW from "@/data/place-refresh-identities.json" with { type: "json" };
import {
  assessHoursRefreshRun,
  HOURS_REFRESH_CYCLE_DAYS,
  hoursRefreshCycleDay,
  resolveHoursRefreshCycleSelection,
  selectHoursRefreshTargets,
} from "@/lib/hours-refresh-targets";
import { HOURS_MAX_AGE_DAYS } from "@/lib/hours-freshness";
import { isGooglePlaceId } from "@/lib/provenance";

describe("hours refresh target selection", () => {
  it("uses the scheduled bucket unless an explicit backfill bucket is requested", () => {
    const now = new Date("2026-07-26T08:00:00.000Z").getTime();
    const scheduled = Math.floor(now / 86_400_000) % HOURS_REFRESH_CYCLE_DAYS;

    expect(
      resolveHoursRefreshCycleSelection(
        "https://frederickradius.app/api/cron/hours-refresh",
        now,
      ),
    ).toEqual({ cycleDay: scheduled, mode: "scheduled" });
    expect(
      resolveHoursRefreshCycleSelection(
        "https://frederickradius.app/api/cron/hours-refresh?cycleDay=3",
        now,
      ),
    ).toEqual({ cycleDay: 3, mode: "backfill" });
  });

  it("refreshes every bucket before the publication freshness window expires", () => {
    expect(HOURS_REFRESH_CYCLE_DAYS).toBeLessThan(HOURS_MAX_AGE_DAYS);
  });

  it("rejects malformed or repeated backfill buckets", () => {
    expect(() =>
      resolveHoursRefreshCycleSelection(
        `https://frederickradius.app/api/cron/hours-refresh?cycleDay=${HOURS_REFRESH_CYCLE_DAYS}`,
      ),
    ).toThrow(
      `cycleDay must be one integer from 0 to ${HOURS_REFRESH_CYCLE_DAYS - 1}`,
    );
    expect(() =>
      resolveHoursRefreshCycleSelection(
        "https://frederickradius.app/api/cron/hours-refresh?cycleDay=1&cycleDay=2",
      ),
    ).toThrow(
      `cycleDay must be one integer from 0 to ${HOURS_REFRESH_CYCLE_DAYS - 1}`,
    );
  });

  it("includes Google-backed discovered records instead of filtering by source", () => {
    const slug = "discovered-cafe";
    const day = hoursRefreshCycleDay(slug);
    const places = [
      { slug, google_place_id: "google-1", source: "discovered" },
      { slug: "missing-google-id", source: "partner" },
    ];

    expect(selectHoursRefreshTargets(places, day, 10)).toEqual([places[0]]);
  });

  it("is deterministic and respects the paid-call cap", () => {
    const all = Array.from({ length: 100 }, (_, index) => ({
      slug: `place-${index}`,
      google_place_id: `google-${index}`,
    }));
    const day = hoursRefreshCycleDay("place-1");
    const first = selectHoursRefreshTargets(all, day, 3);
    const second = selectHoursRefreshTargets([...all].reverse(), day, 3);

    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
  });

  it("keeps every canonical refresh bucket inside the production paid-call cap", () => {
    const cap = 400;
    const places = (
      REFRESH_IDENTITIES_RAW as {
        identities: Array<{
          slug: string;
          google_place_id?: string;
        }>;
      }
    ).identities.filter((place) => isGooglePlaceId(place.google_place_id));
    const buckets = Array.from(
      { length: HOURS_REFRESH_CYCLE_DAYS },
      (_, day) => selectHoursRefreshTargets(places, day, cap),
    );

    expect(buckets.every((bucket) => bucket.length > 0)).toBe(true);
    expect(Math.max(...buckets.map((bucket) => bucket.length))).toBeLessThanOrEqual(
      cap,
    );
    expect(buckets.flat()).toHaveLength(places.length);
    expect(new Set(buckets.flat().map((place) => place.slug)).size).toBe(
      places.length,
    );
  });

  it("fails before spending when two slugs share a Google identity", () => {
    const places = [
      { slug: "z-alias", google_place_id: "same-google-id" },
      { slug: "a-canonical", google_place_id: "same-google-id" },
    ];
    const day = hoursRefreshCycleDay("a-canonical");
    expect(() => selectHoursRefreshTargets(places, day, 10)).toThrow(
      "Duplicate Google Place ID same-google-id belongs to both a-canonical and z-alias.",
    );
    expect(() =>
      selectHoursRefreshTargets([...places].reverse(), day, 10),
    ).toThrow(
      "Duplicate Google Place ID same-google-id belongs to both a-canonical and z-alias.",
    );
  });

  it("continues to ignore records without a provider identity", () => {
    const slug = "canonical";
    const day = hoursRefreshCycleDay(slug);
    const places = [
      { slug, google_place_id: "google-1" },
      { slug: "missing", google_place_id: null },
      { slug: "also-missing" },
    ];

    expect(selectHoursRefreshTargets(places, day, 10)).toEqual([places[0]]);
  });

  it("rejects one slug mapped to two provider identities", () => {
    const places = [
      { slug: "same-slug", google_place_id: "google-1" },
      { slug: "same-slug", google_place_id: "google-2" },
    ];

    expect(() =>
      selectHoursRefreshTargets(
        places,
        hoursRefreshCycleDay("same-slug"),
        10,
      ),
    ).toThrow(
      "Duplicate hours-refresh slug same-slug maps to both google-1 and google-2.",
    );
  });

  it("marks a zero-write paid run as failed instead of returning silent success", () => {
    expect(
      assessHoursRefreshRun({
        targeted: 120,
        written: 0,
        withHours: 0,
        deferred: 0,
      }),
    ).toEqual({
      healthy: false,
      status: 503,
      error: "No refresh rows were persisted.",
    });
  });

  it("fails when a deterministic bucket exceeds the cap", () => {
    expect(
      assessHoursRefreshRun({
        targeted: 400,
        written: 390,
        withHours: 360,
        deferred: 12,
      }),
    ).toMatchObject({
      healthy: false,
      status: 503,
    });
  });

  it("requires a useful success ratio and at least one hours schedule", () => {
    expect(
      assessHoursRefreshRun({
        targeted: 100,
        written: 89,
        withHours: 80,
        deferred: 0,
      }).status,
    ).toBe(502);
    expect(
      assessHoursRefreshRun({
        targeted: 100,
        written: 95,
        withHours: 0,
        deferred: 0,
      }).status,
    ).toBe(502);
    expect(
      assessHoursRefreshRun({
        targeted: 100,
        written: 90,
        withHours: 80,
        deferred: 0,
      }),
    ).toEqual({ healthy: true, status: 200 });
  });
});
