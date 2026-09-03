import { describe, expect, it } from "vitest";

import {
  buildPublicDataSnapshot,
  publicHoursProductHealth,
  publicDataSnapshot,
} from "@/lib/public-data-snapshot";

const RELEASE = {
  data_version: `sha256:${"a".repeat(64)}`,
  streams: {
    places: { promoted_at: "2026-08-11T12:00:00Z" },
    sources: { promoted_at: "2026-08-12T12:00:00Z" },
  },
};

describe("public data snapshot", () => {
  it("derives deterministic place counts at the promotion time", () => {
    const places = [
      {
        slug: "ready-place",
        name: "Ready Place",
        is_operational: "operational",
        geom: { lat: 39.4, lng: -77.4 },
        hours_verified: true,
        hours_updated_at: "2026-08-10T12:00:00Z",
        hours: { mon: [{ open: "09:00", close: "17:00" }] },
        short_blurb:
          "This independent shop carries locally made gifts and practical home goods.",
        hero_image: "/images/ready.jpg",
        website: "https://example.test",
      },
      {
        slug: "stale-place",
        name: "Stale Place",
        is_operational: "operational",
        geom: { lat: 39.5, lng: -77.5 },
        hours_verified: true,
        hours_updated_at: "2026-08-01T12:00:00Z",
        hours: { tue: [{ open: "09:00", close: "17:00" }] },
        short_blurb: "",
      },
      {
        slug: "closed-place",
        name: "Closed Place",
        is_operational: "closed_permanently",
        geom: { lat: 39.6, lng: -77.6 },
      },
    ];

    const readAt = new Date("2026-08-11T12:00:00Z");
    const first = buildPublicDataSnapshot(RELEASE, places, readAt);
    const second = buildPublicDataSnapshot(RELEASE, places, readAt);

    expect(second).toEqual(first);
    expect(first.lastSuccessfulDataPromotion).toBe("2026-08-12T12:00:00Z");
    expect(first.counts.activePublicPlaces.value).toBe(2);
    expect(first.counts.mappedPlaces.value).toBe(2);
    expect(first.counts.placesWithCurrentHours.value).toBe(1);
    expect(first.counts.placesWithDecisionCopy.value).toBe(1);
    expect(first.counts.placesWithPhoto.value).toBe(1);
    expect(first.counts.placesWithAction.value).toBe(1);
  });

  it("ages hours coverage out with the clock while data counts hold still", () => {
    // The whole point of the request-time evaluation. /trust published "713 of
    // 1,569 places (45%)" for days after the real figure had decayed to 0,
    // because the count was anchored to the promotion instead of to now. A
    // reader checking the page got a number that could not go down. Hours
    // coverage must fall as the schedules age; everything else must not move,
    // because those ARE properties of the promoted data.
    const places = [
      {
        slug: "ready-place",
        name: "Ready Place",
        is_operational: "operational",
        geom: { lat: 39.4, lng: -77.4 },
        hours_verified: true,
        hours_updated_at: "2026-08-10T12:00:00Z",
        hours: { mon: [{ open: "09:00", close: "17:00" }] },
        short_blurb:
          "This independent shop carries locally made gifts and practical home goods.",
        hero_image: "/images/ready.jpg",
        website: "https://example.test",
      },
    ];

    const sameDay = buildPublicDataSnapshot(
      RELEASE,
      places,
      new Date("2026-08-11T12:00:00Z"),
    );
    const eightDaysOn = buildPublicDataSnapshot(
      RELEASE,
      places,
      new Date("2026-08-19T12:00:00Z"),
    );

    expect(sameDay.counts.placesWithCurrentHours.value).toBe(1);
    expect(eightDaysOn.counts.placesWithCurrentHours.value).toBe(0);

    // Stamped with the read, not the promotion, so the figure is checkable.
    expect(eightDaysOn.counts.placesWithCurrentHours.asOf).toBe(
      "2026-08-19T12:00:00.000Z",
    );

    // The promoted-data counts are identical across the same two reads.
    for (const key of [
      "activePublicPlaces",
      "mappedPlaces",
      "placesWithDecisionCopy",
      "placesWithPhoto",
      "placesWithAction",
    ] as const) {
      expect(eightDaysOn.counts[key]).toEqual(sameDay.counts[key]);
      expect(eightDaysOn.counts[key].asOf).toBe("2026-08-11T12:00:00Z");
    }
  });

  it("marks runtime-only event and source counts unavailable instead of zero", () => {
    const snapshot = buildPublicDataSnapshot(RELEASE, []);

    expect(snapshot.counts.upcomingCanonicalEvents).toEqual({
      status: "unavailable",
      value: null,
      asOf: null,
      reason: "runtime_only_not_promoted",
    });
    expect(snapshot.counts.currentSources.value).toBeNull();
    expect(snapshot.counts.degradedSources.status).toBe("unavailable");
  });

  it("reports current public hours coverage against the Open Now gate", () => {
    const snapshot = buildPublicDataSnapshot(
      RELEASE,
      [
        {
          slug: "fresh",
          name: "Fresh",
          is_operational: "operational",
          hours_verified: true,
          hours_updated_at: "2026-08-10T12:00:00Z",
          hours: { mon: [{ open: "09:00", close: "17:00" }] },
        },
        {
          slug: "missing",
          name: "Missing",
          is_operational: "operational",
        },
      ],
      new Date("2026-08-11T12:00:00Z"),
    );

    expect(publicHoursProductHealth(snapshot, true)).toEqual({
      status: "degraded",
      mode: "active_refresh",
      current: 1,
      expected: 2,
      coveragePct: 50,
      target: 2,
      targetPct: 60,
      checkedAt: "2026-08-11T12:00:00.000Z",
      operatorMessage: null,
    });
  });

  it("reports an intentional policy hold without disguising zero coverage", () => {
    const snapshot = buildPublicDataSnapshot(
      RELEASE,
      [{ slug: "missing", name: "Missing", is_operational: "operational" }],
      new Date("2026-08-11T12:00:00Z"),
    );

    expect(publicHoursProductHealth(snapshot, false)).toEqual({
      status: "policy_hold",
      mode: "policy_hold",
      current: 0,
      expected: 1,
      coveragePct: 0,
      target: 1,
      targetPct: 60,
      checkedAt: "2026-08-11T12:00:00.000Z",
      operatorMessage: expect.stringContaining(
        "Current-hours coverage remains unavailable",
      ),
    });
  });

  it("matches the checked-in promoted release", () => {
    const snapshot = publicDataSnapshot();

    expect(snapshot.dataVersion).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(snapshot.counts.activePublicPlaces.value).toBeGreaterThan(0);
    expect(snapshot.counts.mappedPlaces.value).toBeLessThanOrEqual(
      snapshot.counts.activePublicPlaces.value,
    );
  });
});
