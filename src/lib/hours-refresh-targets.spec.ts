import { describe, expect, it } from "vitest";
import {
  assessHoursRefreshRun,
  HOURS_REFRESH_DEFAULT_RUN_CAP,
  HOURS_REFRESH_CYCLE_DAYS,
  HOURS_REFRESH_MAX_RUN_CAP,
  hoursRefreshCycleDay,
  isHoursRefreshCategory,
  resolveHoursRefreshCycleSelection,
  resolveHoursRefreshRunCap,
  selectHoursRefreshTargets,
} from "@/lib/hours-refresh-targets";
import { HOURS_MAX_AGE_DAYS } from "@/lib/hours-freshness";
import { isGooglePlaceId } from "@/lib/provenance";
import {
  hoursRefreshTargetIdentities,
  placeRefreshIdentities,
} from "@/lib/loaders/placeRefreshIdentities";

describe("hours refresh target selection", () => {
  it.each([
    "restaurant",
    "Restaurants",
    "cafe",
    "Café",
    "coffee_shop",
    "bakery",
    "pub",
    "brewpub",
    "winery",
    "distilleries",
    "farmers market",
    "pizzeria",
    "ice_cream",
    "gelato",
  ])("includes the time-sensitive food/drink category %s", (category) => {
    expect(isHoursRefreshCategory(category)).toBe(true);
  });

  it.each([
    "park",
    "museum",
    "shopping",
    "lodging",
    "salon",
    "government",
    "worship",
    "food",
    "",
  ])("keeps the excluded category %s out of paid hours refreshes", (category) => {
    expect(isHoursRefreshCategory(category)).toBe(false);
  });

  it("defaults to 80 paid calls and never lets an environment override raise the ceiling", () => {
    expect(resolveHoursRefreshRunCap("")).toBe(HOURS_REFRESH_DEFAULT_RUN_CAP);
    expect(resolveHoursRefreshRunCap("40")).toBe(40);
    expect(resolveHoursRefreshRunCap("81")).toBe(HOURS_REFRESH_MAX_RUN_CAP);
    expect(resolveHoursRefreshRunCap("9999")).toBe(HOURS_REFRESH_MAX_RUN_CAP);
    expect(resolveHoursRefreshRunCap("0")).toBe(HOURS_REFRESH_DEFAULT_RUN_CAP);
    expect(resolveHoursRefreshRunCap("not-a-number")).toBe(
      HOURS_REFRESH_DEFAULT_RUN_CAP,
    );
  });

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
      {
        slug,
        google_place_id: "google-1",
        category: "cafe",
        source: "discovered",
      },
      {
        slug: "missing-google-id",
        category: "coffee",
        source: "partner",
      },
    ];

    expect(selectHoursRefreshTargets(places, day, 10)).toEqual([places[0]]);
  });

  it("is deterministic and respects the paid-call cap", () => {
    const all = Array.from({ length: 100 }, (_, index) => ({
      slug: `place-${index}`,
      google_place_id: `google-${index}`,
      category: "restaurant",
    }));
    const day = hoursRefreshCycleDay("place-1");
    const first = selectHoursRefreshTargets(all, day, 3);
    const second = selectHoursRefreshTargets([...all].reverse(), day, 3);

    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
  });

  it("keeps every canonical refresh bucket inside the production paid-call cap", () => {
    const cap = HOURS_REFRESH_MAX_RUN_CAP;
    const places = placeRefreshIdentities().filter((place) =>
      isGooglePlaceId(place.google_place_id),
    );
    const eligiblePlaces = hoursRefreshTargetIdentities();
    const buckets = Array.from(
      { length: HOURS_REFRESH_CYCLE_DAYS },
      (_, day) => selectHoursRefreshTargets(places, day, cap),
    );

    expect(buckets.every((bucket) => bucket.length > 0)).toBe(true);
    expect(Math.max(...buckets.map((bucket) => bucket.length))).toBeLessThanOrEqual(
      cap,
    );
    expect(buckets.flat()).toHaveLength(eligiblePlaces.length);
    expect(new Set(buckets.flat().map((place) => place.slug)).size).toBe(
      eligiblePlaces.length,
    );
    expect(
      buckets.flat().every((place) => isHoursRefreshCategory(place.category)),
    ).toBe(true);
    expect(eligiblePlaces.length).toBeLessThan(places.length);
    expect(eligiblePlaces).toEqual(
      places.filter((place) => isHoursRefreshCategory(place.category)),
    );
  });

  it("keeps category filtering and cycle buckets stable across input order", () => {
    const places = Array.from({ length: 120 }, (_, index) => ({
      slug: `stable-place-${index}`,
      google_place_id: `stable-google-${index}`,
      category:
        index % 3 === 0 ? "restaurant" : index % 3 === 1 ? "cafe" : "park",
    }));
    const assignments = (input: typeof places) =>
      Array.from({ length: HOURS_REFRESH_CYCLE_DAYS }, (_, day) =>
        selectHoursRefreshTargets(input, day, HOURS_REFRESH_MAX_RUN_CAP).map(
          (place) => `${day}:${place.slug}`,
        ),
      ).flat();

    const first = assignments(places);
    const second = assignments([...places].reverse());

    expect(second).toEqual(first);
    expect(first).toHaveLength(80);
    const expectedEligibleSlugs = new Set(
      places
        .filter((place) => isHoursRefreshCategory(place.category))
        .map((place) => place.slug),
    );
    expect(
      first.every((assignment) =>
        expectedEligibleSlugs.has(assignment.slice(assignment.indexOf(":") + 1)),
      ),
    ).toBe(true);
  });

  it("fails before spending when two slugs share a Google identity", () => {
    const places = [
      {
        slug: "z-alias",
        google_place_id: "same-google-id",
        category: "restaurant",
      },
      {
        slug: "a-canonical",
        google_place_id: "same-google-id",
        category: "restaurant",
      },
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
      { slug, google_place_id: "google-1", category: "restaurant" },
      { slug: "missing", google_place_id: null, category: "restaurant" },
      { slug: "also-missing", category: "restaurant" },
    ];

    expect(selectHoursRefreshTargets(places, day, 10)).toEqual([places[0]]);
  });

  it("rejects one slug mapped to two provider identities", () => {
    const places = [
      {
        slug: "same-slug",
        google_place_id: "google-1",
        category: "restaurant",
      },
      {
        slug: "same-slug",
        google_place_id: "google-2",
        category: "restaurant",
      },
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
