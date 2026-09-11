import { describe, expect, it } from "vitest";
import { settleFoodTruckPageData } from "./page-data";

describe("food-truck page data response budget", () => {
  it("renders an honest local fallback when external reads never settle", async () => {
    const never = new Promise<never>(() => {});
    const now = new Date("2026-07-26T12:00:00.000Z");
    const result = await settleFoodTruckPageData({
      beacons: never,
      schedule: never,
      now,
      beaconBudgetMs: 5,
      scheduleBudgetMs: 5,
    });

    expect(result.beaconByTruck.size).toBe(0);
    expect(result.schedule.stops).toEqual([]);
    expect(result.schedule.sources[0]).toMatchObject({
      ok: false,
      error: "The schedule did not answer in time.",
    });
  });

  it("keeps successful reads unchanged", async () => {
    const now = new Date("2026-07-26T12:00:00.000Z");
    const schedule = {
      version: 1 as const,
      generatedAt: now.toISOString(),
      windowStart: now.toISOString(),
      windowEnd: new Date(now.getTime() + 86_400_000).toISOString(),
      stops: [],
      sources: [],
    };
    const beacons = new Map();
    const result = await settleFoodTruckPageData({
      beacons: Promise.resolve(beacons),
      schedule: Promise.resolve(schedule),
      now,
      beaconBudgetMs: 5,
      scheduleBudgetMs: 5,
    });

    expect(result.beaconByTruck).toBe(beacons);
    expect(result.schedule).toBe(schedule);
  });
});
