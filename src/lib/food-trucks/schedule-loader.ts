import "server-only";

import { buildFoodTruckSchedule } from "./schedule";
import { readStoredFoodTruckSchedule } from "./schedule-store";
import type { FoodTruckScheduleSnapshot } from "./schedule-types";

function coversNow(snapshot: FoodTruckScheduleSnapshot, now: Date): boolean {
  const time = now.getTime();
  const generated = Date.parse(snapshot.generatedAt);
  return (
    Number.isFinite(generated) &&
    time - generated < 36 * 60 * 60 * 1000 &&
    time >= Date.parse(snapshot.windowStart) &&
    time < Date.parse(snapshot.windowEnd)
  );
}

/**
 * Read only the cron-built schedule.
 *
 * Lightweight surfaces such as Today use this path so a missing cache cannot
 * turn five optional publisher feeds into render-blocking work. The dedicated
 * food-truck page still uses `getFoodTruckSchedule` and may rebuild from those
 * official sources when the stored board is unavailable.
 */
export async function getStoredFoodTruckSchedule(
  now = new Date(),
): Promise<FoodTruckScheduleSnapshot | null> {
  const stored = await readStoredFoodTruckSchedule();
  return stored && coversNow(stored, now) ? stored : null;
}

/** Read the cron-built board first, then fail softly to the official feeds. */
export async function getFoodTruckSchedule(now = new Date()): Promise<FoodTruckScheduleSnapshot> {
  const stored = await getStoredFoodTruckSchedule(now);
  if (stored) return stored;
  return buildFoodTruckSchedule(now);
}
