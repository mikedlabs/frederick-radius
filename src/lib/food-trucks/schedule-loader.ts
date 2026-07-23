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
/** Read the cron-built board first, then fail softly to the official feeds. */
export async function getFoodTruckSchedule(now = new Date()): Promise<FoodTruckScheduleSnapshot> {
  const stored = await readStoredFoodTruckSchedule();
  if (stored && coversNow(stored, now)) return stored;
  return buildFoodTruckSchedule(now);
}
