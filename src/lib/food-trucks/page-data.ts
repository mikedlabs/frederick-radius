import type { TruckBeacon } from "./beacon";
import type { FoodTruckScheduleSnapshot } from "./schedule-types";

export const FOOD_TRUCK_BEACON_BUDGET_MS = 2_000;
export const FOOD_TRUCK_SCHEDULE_BUDGET_MS = 5_500;

function withFallback<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise.catch(() => fallback), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function unavailableFoodTruckSchedule(now = new Date()): FoodTruckScheduleSnapshot {
  const start = now.toISOString();
  return {
    version: 1,
    generatedAt: start,
    windowStart: start,
    windowEnd: new Date(now.getTime() + 8 * 86_400_000).toISOString(),
    stops: [],
    sources: [{
      id: "food-truck-board",
      label: "Published food-truck schedules",
      ok: false,
      count: 0,
      checkedAt: start,
      error: "The schedule did not answer in time.",
    }],
  };
}

/**
 * One hard response budget around every external dependency used by the
 * public food-truck page. Database, Blob, and official-calendar clients have
 * their own safeguards, but this boundary guarantees the route can still
 * render the local roster if one of those clients never settles.
 */
export async function settleFoodTruckPageData({
  beacons,
  schedule,
  now = new Date(),
  beaconBudgetMs = FOOD_TRUCK_BEACON_BUDGET_MS,
  scheduleBudgetMs = FOOD_TRUCK_SCHEDULE_BUDGET_MS,
}: {
  beacons: Promise<Map<string, TruckBeacon>>;
  schedule: Promise<FoodTruckScheduleSnapshot>;
  now?: Date;
  beaconBudgetMs?: number;
  scheduleBudgetMs?: number;
}): Promise<{
  beaconByTruck: Map<string, TruckBeacon>;
  schedule: FoodTruckScheduleSnapshot;
}> {
  const [beaconByTruck, resolvedSchedule] = await Promise.all([
    withFallback(beacons, beaconBudgetMs, new Map<string, TruckBeacon>()),
    withFallback(schedule, scheduleBudgetMs, unavailableFoodTruckSchedule(now)),
  ]);
  return { beaconByTruck, schedule: resolvedSchedule };
}
