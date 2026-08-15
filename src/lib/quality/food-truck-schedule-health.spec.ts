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
    expect(result).toMatchObject({
      trackedSources: 1,
      successfulSources: 1,
      productiveSources: 0,
      retainedStopCount: 0,
      canonicalLinkRatePct: null,
      lastSuccessAt: "2026-07-27T12:00:00.000Z",
    });
    expect(result.anomalies).toEqual([]);
  });

  it("rejects an artifact with no tracked sources", () => {
    const result = evaluateFoodTruckScheduleHealth(
      snapshot({ sources: [] }),
      NOW,
    );

    expect(result.green).toBe(false);
    expect(result.trackedSources).toBe(0);
    expect(result.anomalies).toContainEqual(expect.objectContaining({
      kind: "live_source_failed",
      detail: expect.stringContaining("does not identify any tracked sources"),
    }));
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

  it("reports source productivity, retained stops, and canonical vendor coverage", () => {
    const result = evaluateFoodTruckScheduleHealth(
      snapshot({
        stops: [{
          id: "stop",
          sourceId: "venue-calendar",
          title: "Two trucks",
          startsAt: "2026-07-28T20:00:00.000Z",
          venueName: "Venue",
          vendors: [
            { name: "Known truck", slug: "known-truck" },
            { name: "Unmatched truck" },
          ],
          sourceName: "Venue calendar",
          sourceUrl: "https://example.com",
          confidence: "venue",
        }],
        sources: [{
          id: "venue-calendar",
          label: "Venue calendar",
          ok: true,
          count: 1,
          checkedAt: "2026-07-27T12:00:00.000Z",
          lastSuccessAt: "2026-07-27T12:00:00.000Z",
          retainedCount: 1,
        }],
      }),
      NOW,
    );

    expect(result).toMatchObject({
      trackedSources: 1,
      successfulSources: 1,
      productiveSources: 1,
      retainedStopCount: 1,
      vendorMentions: 2,
      canonicalVendorLinks: 1,
      canonicalLinkRatePct: 50,
    });
  });

  it("makes a suspicious zero or large drop visible without calling it a fetch failure", () => {
    const zero = evaluateFoodTruckScheduleHealth(
      snapshot({
        sources: [{
          id: "venue-calendar",
          label: "Venue calendar",
          ok: true,
          count: 0,
          checkedAt: "2026-07-27T12:00:00.000Z",
          previousCount: 4,
          suspiciousZero: true,
        }],
      }),
      NOW,
    );
    expect(zero.green).toBe(false);
    expect(zero.failedSources).toEqual([]);
    expect(zero.suspiciousZeroSources).toEqual(["Venue calendar"]);
    expect(zero.anomalies[0]).toMatchObject({ kind: "empty_batch" });

    const drop = evaluateFoodTruckScheduleHealth(
      snapshot({
        sources: [{
          id: "venue-calendar",
          label: "Venue calendar",
          ok: true,
          count: 2,
          checkedAt: "2026-07-27T12:00:00.000Z",
          previousCount: 5,
          suspiciousDrop: true,
        }],
      }),
      NOW,
    );
    expect(drop.green).toBe(false);
    expect(drop.suspiciousDropSources).toEqual(["Venue calendar"]);
    expect(drop.anomalies[0]).toMatchObject({ kind: "count_drop" });
  });
});
