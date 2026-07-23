import { afterEach, describe, expect, it } from "vitest";
import {
  getHoursAvailability,
  hasReliableHours,
  type HoursAvailabilityPlace,
} from "@/lib/hours-availability";

const NOW = new Date("2026-07-23T12:00:00-04:00");
const FRESH = "2026-07-22T12:00:00-04:00";
const STALE = "2026-06-22T12:00:00-04:00";
const HOURS = { mon: [{ open: "08:00", close: "17:00" }] };

function place(
  slug: string,
  overrides: Partial<HoursAvailabilityPlace> = {},
): HoursAvailabilityPlace {
  return {
    slug,
    hours: HOURS,
    hours_verified: true,
    hours_updated_at: FRESH,
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.HOURS_FRESHNESS_ENFORCED;
});

describe("hours availability", () => {
  it("counts only current, verified, publishable schedules", () => {
    process.env.HOURS_FRESHNESS_ENFORCED = "1";
    expect(hasReliableHours(place("fresh"), NOW)).toBe(true);
    expect(
      hasReliableHours(
        place("stale", { hours_updated_at: STALE }),
        NOW,
      ),
    ).toBe(false);
    expect(
      hasReliableHours(
        place("unverified", { hours_verified: false }),
        NOW,
      ),
    ).toBe(false);
    expect(
      hasReliableHours(place("missing", { hours: undefined }), NOW),
    ).toBe(false);
  });

  it("disables Open now when coverage is insufficient and exposes why", () => {
    process.env.HOURS_FRESHNESS_ENFORCED = "1";
    const result = getHoursAvailability(
      [
        place("fresh"),
        place("stale", { hours_updated_at: STALE }),
        place("unknown", { hours: undefined }),
      ],
      { now: NOW, minimumCoverage: 0.6 },
    );

    expect(result).toMatchObject({
      status: "insufficient",
      enabled: false,
      total: 3,
      reliable: 1,
      coverage: 1 / 3,
      minimumCoverage: 0.6,
      source: "current-verified-hours",
    });
  });

  it("enables the control only after the explicit threshold is met", () => {
    const result = getHoursAvailability(
      [place("one"), place("two"), place("three", { hours: undefined })],
      { now: NOW, minimumCoverage: 0.6 },
    );

    expect(result.status).toBe("available");
    expect(result.enabled).toBe(true);
    expect(result.reliable).toBe(2);
  });
});
