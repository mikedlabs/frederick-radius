import { formatEasternClock } from "@/lib/format/easternClock";
import { easternDayKey } from "@/lib/tz";
import type { FoodTruckScheduleStop } from "./schedule-types";

export type TodayFoodTruckStopSummary = {
  truckName: string;
  venueName: string;
  startsAt: string;
  endsAt?: string;
  /** Older callers may omit this; summaries returned by the selector set it. */
  timing?: "scheduled-now" | "upcoming";
};

type TodayFoodTruckCandidate = {
  stop: FoodTruckScheduleStop;
  timing: "scheduled-now" | "upcoming";
};

/** The current or next published stop with a named vendor. This is schedule
 * information, never proof that the truck has arrived. */
export function nextPublishedFoodTruckStop(
  stops: readonly FoodTruckScheduleStop[],
  now: Date,
): TodayFoodTruckStopSummary | null {
  const nowMs = now.getTime();
  const next = stops
    .flatMap((stop): TodayFoodTruckCandidate[] => {
      const startsAt = Date.parse(stop.startsAt);
      if (
        !Number.isFinite(startsAt) ||
        !stop.vendors.some((vendor) => Boolean(vendor.name.trim()))
      ) {
        return [];
      }
      if (startsAt >= nowMs) {
        return [{ stop, timing: "upcoming" as const }];
      }
      const endsAt = stop.endsAt ? Date.parse(stop.endsAt) : Number.NaN;
      return Number.isFinite(endsAt) && endsAt > nowMs
        ? [{ stop, timing: "scheduled-now" as const }]
        : [];
    })
    .sort((a, b) => {
      if (a.timing !== b.timing) {
        return a.timing === "scheduled-now" ? -1 : 1;
      }
      return Date.parse(a.stop.startsAt) - Date.parse(b.stop.startsAt);
    })[0];
  if (!next) return null;

  const vendors = next.stop.vendors
    .map((vendor) => vendor.name.trim())
    .filter(Boolean);
  const firstVendor = vendors[0]!;
  const truckName =
    vendors.length > 1
      ? `${firstVendor} + ${vendors.length - 1} more`
      : firstVendor;

  return {
    truckName,
    venueName: next.stop.venueName,
    startsAt: next.stop.startsAt,
    ...(next.stop.endsAt ? { endsAt: next.stop.endsAt } : {}),
    timing: next.timing,
  };
}

export function todayFoodTruckStopDetail(
  stop: TodayFoodTruckStopSummary,
  asOf: Date,
): string {
  if (stop.timing === "scheduled-now" && stop.endsAt) {
    return `Scheduled now: ${stop.truckName} at ${stop.venueName}, through ${formatEasternClock(new Date(stop.endsAt))}.`;
  }
  const start = new Date(stop.startsAt);
  const day =
    easternDayKey(start) === easternDayKey(asOf)
      ? "today"
      : new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          weekday: "short",
        }).format(start);
  return `Next: ${stop.truckName} at ${stop.venueName}, ${day} at ${formatEasternClock(start)}.`;
}
