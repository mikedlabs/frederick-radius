import { describe, expect, it } from "vitest";
import type { FoodTruckScheduleSnapshot } from "@/lib/food-trucks/schedule-types";
import { evaluateFoodTruckScheduleHealth } from "./food-truck-schedule-health";

const NOW = new Date("2026-07-27T18:00:00.000Z");

function snapshot(
  overrides: Partial<FoodTruckScheduleSnapshot> = {},
): FoodTruckScheduleSnapshot {
  return {
    version: 1,
    generatedAt: "2026-07-27T12:00:00.000Z",
    windowStart: "2026-07-27T00:00:00.000Z",
    windowEnd: "2026-08-04T00:00:00.000Z",
    stops: [],
    sources: [{
      id: "venue-calendar",
      label: "Venue calendar",
      ok: true,
      count: 0,
      checkedAt: "2026-07-27T12:00:00.000Z",
    }],
    ...overrides,
  };
}

describe("food-truck schedule health", () => {
  it("accepts a fresh, successful schedule even when the week is quiet", () => {
    const result = evaluateFoodTruckScheduleHealth(snapshot(), NOW);
    expect(result.green).toBe(true);
    expect(result.stopCount).toBe(0);
    expect(result.anomalies).toEqual([]);
  });

  it("flags a missing or stale stored artifact", () => {
    expect(evaluateFoodTruckScheduleHealth(null, NOW).green).toBe(false);
    const stale = evaluateFoodTruckScheduleHealth(
      snapshot({ generatedAt: "2026-07-25T00:00:00.000Z" }),
      NOW,
    );
    expect(stale.green).toBe(false);
    expect(stale.anomalies[0]?.kind).toBe("snapshot_expired");
  });

  it("rejects invalid and implausibly future generated timestamps", () => {
    const invalid = evaluateFoodTruckScheduleHealth(
      snapshot({ generatedAt: "not-a-date" }),
      NOW,
    );
    expect(invalid.green).toBe(false);
    expect(invalid.ageHours).toBeNull();
    expect(invalid.anomalies[0]?.detail).toContain("invalid");

    const future = evaluateFoodTruckScheduleHealth(
      snapshot({ generatedAt: "2026-07-27T20:00:00.000Z" }),
      NOW,
    );
    expect(future.green).toBe(false);
    expect(future.anomalies[0]?.detail).toContain("future");
  });

  it("names failed official sources without treating zero stops as failure", () => {
    const result = evaluateFoodTruckScheduleHealth(
      snapshot({
        sources: [{
          id: "venue-calendar",
          label: "Venue calendar",
          ok: false,
          count: 0,
          checkedAt: "2026-07-27T12:00:00.000Z",
          error: "HTTP 503",
        }],
      }),
      NOW,
    );
    expect(result.green).toBe(false);
    expect(result.failedSources).toEqual(["Venue calendar"]);
    expect(result.anomalies).toMatchObject([{
      source: "food-truck:venue-calendar",
      kind: "live_source_failed",
    }]);
  });
});
