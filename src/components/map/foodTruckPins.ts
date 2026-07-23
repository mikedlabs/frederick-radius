import type { FoodTruckMapPin } from "./types";

/** Keep only operator beacons whose stated window includes this instant. */
export function activeFoodTruckPins(
  pins: readonly FoodTruckMapPin[],
  nowMs: number,
): FoodTruckMapPin[] {
  return pins.filter((pin) => {
    const start = Date.parse(pin.startedAt);
    const end = Date.parse(pin.expiresAt);
    return Number.isFinite(start) && Number.isFinite(end) && start <= nowMs && end > nowMs;
  });
}
