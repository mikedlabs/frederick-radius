import { afterEach, describe, expect, it } from "vitest";
import {
  summarizeFreshHoursHealth,
  type FreshHoursHealth,
} from "@/lib/quality/trust-report";
import type { HoursAvailabilityPlace } from "@/lib/hours-availability";

const NOW = new Date("2026-07-27T12:00:00-04:00");
const HOURS = { mon: [{ open: "08:00", close: "17:00" }] };

function place(
  slug: string,
  overrides: Partial<HoursAvailabilityPlace> = {},
): HoursAvailabilityPlace {
  return {
    slug,
    category: "restaurant",
    hours: HOURS,
    hours_verified: true,
    hours_updated_at: "2026-07-26T12:00:00-04:00",
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.HOURS_FRESHNESS_ENFORCED;
});

describe("fresh-hours health", () => {
  it("reports the count, coverage, target, and Open Now eligibility", () => {
    const result = summarizeFreshHoursHealth(
      [
        place("fresh"),
        place("stale", {
          hours_updated_at: "2026-07-01T12:00:00-04:00",
        }),
        place("missing", { hours: undefined }),
      ],
      NOW,
      undefined,
      new Set(["fresh", "stale", "missing"]),
    );

    expect(result).toEqual<FreshHoursHealth>({
      fresh_count: 1,
      total_count: 3,
      coverage_pct: 33.3,
      eligibility_fresh_count: 1,
      eligibility_total_count: 3,
      eligibility_coverage_pct: 33.3,
      eligibility_scope: "time-sensitive-food-drink",
      target_count: 2,
      target_pct: 60,
      open_now_eligible: false,
      below_gate: true,
      checked_at: NOW.toISOString(),
      source: "current-verified-hours",
    });
  });

  it("marks the canonical paid scope healthy without counting an unrefreshable food row", () => {
    const result = summarizeFreshHoursHealth(
      [
        place("restaurant-fresh"),
        place("coffee-fresh", { category: "coffee" }),
        place("restaurant-stale", {
          hours_updated_at: "2026-07-01T12:00:00-04:00",
        }),
        place("restaurant-without-canonical-identity", {
          hours: undefined,
        }),
        ...Array.from({ length: 7 }, (_, index) =>
          place(`park-${index}`, { category: "park", hours: undefined })),
      ],
      NOW,
      undefined,
      new Set(["restaurant-fresh", "coffee-fresh", "restaurant-stale"]),
    );

    expect(result).toMatchObject({
      fresh_count: 2,
      total_count: 11,
      coverage_pct: 18.2,
      eligibility_fresh_count: 2,
      eligibility_total_count: 3,
      eligibility_coverage_pct: 66.7,
      target_count: 2,
      open_now_eligible: true,
      below_gate: false,
    });
  });

  it("does not let unrelated fresh categories satisfy the food/drink gate", () => {
    const result = summarizeFreshHoursHealth(
      [
        place("restaurant-stale", {
          hours_updated_at: "2026-07-01T12:00:00-04:00",
        }),
        place("coffee-missing", { category: "coffee", hours: undefined }),
        ...Array.from({ length: 8 }, (_, index) =>
          place(`park-${index}`, { category: "park" })),
      ],
      NOW,
      undefined,
      new Set(["restaurant-stale", "coffee-missing"]),
    );

    expect(result).toMatchObject({
      fresh_count: 8,
      total_count: 10,
      coverage_pct: 80,
      eligibility_fresh_count: 0,
      eligibility_total_count: 2,
      eligibility_coverage_pct: 0,
      target_count: 2,
      open_now_eligible: false,
      below_gate: true,
    });
  });

  it("does not count historical schedules during an emergency freshness rollback", () => {
    process.env.HOURS_FRESHNESS_ENFORCED = "0";

    const result = summarizeFreshHoursHealth(
      [
        place("historical", {
          hours_updated_at: "2026-06-01T12:00:00-04:00",
        }),
      ],
      NOW,
      undefined,
      new Set(["historical"]),
    );

    expect(result.fresh_count).toBe(0);
    expect(result.coverage_pct).toBe(0);
    expect(result.open_now_eligible).toBe(false);
    expect(result.below_gate).toBe(true);
  });

  it("requires at least one fresh schedule even with an empty catalog target", () => {
    const result = summarizeFreshHoursHealth(
      [],
      NOW,
      undefined,
      new Set(),
    );

    expect(result).toMatchObject({
      fresh_count: 0,
      total_count: 0,
      eligibility_fresh_count: 0,
      eligibility_total_count: 0,
      target_count: 0,
      open_now_eligible: false,
      below_gate: true,
    });
  });
});
