import { describe, expect, it } from "vitest";

import {
  buildPublicDataSnapshot,
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

    const first = buildPublicDataSnapshot(RELEASE, places);
    const second = buildPublicDataSnapshot(RELEASE, places);

    expect(second).toEqual(first);
    expect(first.lastSuccessfulDataPromotion).toBe("2026-08-12T12:00:00Z");
    expect(first.counts.activePublicPlaces.value).toBe(2);
    expect(first.counts.mappedPlaces.value).toBe(2);
    expect(first.counts.placesWithCurrentHours.value).toBe(1);
    expect(first.counts.placesWithDecisionCopy.value).toBe(1);
    expect(first.counts.placesWithPhoto.value).toBe(1);
    expect(first.counts.placesWithAction.value).toBe(1);
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

  it("matches the checked-in promoted release", () => {
    const snapshot = publicDataSnapshot();

    expect(snapshot.dataVersion).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(snapshot.counts.activePublicPlaces.value).toBeGreaterThan(0);
    expect(snapshot.counts.mappedPlaces.value).toBeLessThanOrEqual(
      snapshot.counts.activePublicPlaces.value,
    );
  });
});
