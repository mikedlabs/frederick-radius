import { formatEventTime } from "@/lib/format/eventTime";
import { easternDayKey } from "@/lib/tz";
import type { FoodTruckMapPin } from "./types";

export const FOOD_TRUCK_MAP_SCHEDULE_HORIZON_MS = 24 * 60 * 60 * 1000;

/** How early a published stop may appear on the untouched county overview. */
export const FOOD_TRUCK_OVERVIEW_LEAD_MS = 2 * 60 * 60 * 1000;

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

/**
 * The untouched county overview is a picture of right now. A stop published
 * for tomorrow's lunch drawn there reads as a truck parked tonight (the cold
 * open's only mark was a stop 19 hours ahead, map audit Oct 2026). On that
 * frame a published stop appears from two hours before it starts until it
 * ends; operator-confirmed beacons keep their own window.
 */
export function foodTruckPinsForOverview(
  pins: readonly FoodTruckMapPin[],
  nowMs: number,
): FoodTruckMapPin[] {
  return activeFoodTruckPins(pins, nowMs).filter((pin) => {
    if (pin.availability === "operator-live") return true;
    const start = Date.parse(pin.startedAt);
    return start - FOOD_TRUCK_OVERVIEW_LEAD_MS <= nowMs;
  });
}

/**
 * The small label under a published stop: "Scheduled 5 PM" on the day of the
 * stop and "Scheduled Thu 5 PM" when it falls on another day. A plan keeps
 * the word "Scheduled" for its whole window, because nobody has confirmed the
 * truck is there.
 */
export function scheduledFoodTruckLabel(
  pin: Pick<FoodTruckMapPin, "startedAt">,
  now: Date,
): string | null {
  const start = new Date(pin.startedAt);
  if (!Number.isFinite(start.getTime())) return null;
  const clock = formatEventTime(pin.startedAt).replace(":00 ", " ");
  if (easternDayKey(start) === easternDayKey(now)) return `Scheduled ${clock}`;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(start);
  return `Scheduled ${weekday} ${clock}`;
}
