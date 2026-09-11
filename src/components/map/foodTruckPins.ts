import type { FoodTruckMapPin } from "./types";

export const FOOD_TRUCK_MAP_SCHEDULE_HORIZON_MS = 24 * 60 * 60 * 1000;

/**
 * Keep operator beacons only inside their confirmed window. A published stop
 * may appear up to 24 hours ahead, but drops at its start when no end time was
 * supplied. That keeps a schedule useful without turning it into presence.
 */
export function activeFoodTruckPins(
  pins: readonly FoodTruckMapPin[],
  nowMs: number,
): FoodTruckMapPin[] {
  return pins.filter((pin) => {
    const start = Date.parse(pin.startedAt);
    if (!Number.isFinite(start)) return false;
    if (pin.availability === "operator-live") {
      const end = Date.parse(pin.expiresAt);
      return Number.isFinite(end) && start <= nowMs && end > nowMs;
    }
    if (start > nowMs + FOOD_TRUCK_MAP_SCHEDULE_HORIZON_MS) return false;
    if (!pin.expiresAt) return start >= nowMs;
    const end = Date.parse(pin.expiresAt);
    return Number.isFinite(end) && end > start && end > nowMs;
  });
}
