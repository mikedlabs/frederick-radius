import { haversineMeters, type LngLat } from "@/lib/geo";
import { easternDayKey } from "@/lib/tz";
import type { FoodTruckScheduleStop } from "./schedule-types";

export type NearbyPublishedStopTiming = "scheduled-now" | "today" | "later";

export type NearbyPublishedStop = FoodTruckScheduleStop & {
  lat: number;
  lng: number;
  distance: number | null;
  timing: NearbyPublishedStopTiming;
};

const TIMING_ORDER: Record<NearbyPublishedStopTiming, number> = {
  "scheduled-now": 0,
  today: 1,
  later: 2,
};

function stopTiming(
  stop: FoodTruckScheduleStop,
  now: Date,
): NearbyPublishedStopTiming | null {
  const nowMs = now.getTime();
  const startsAt = Date.parse(stop.startsAt);
  if (!Number.isFinite(startsAt)) return null;
  const endsAt = stop.endsAt ? Date.parse(stop.endsAt) : startsAt;
  if (!Number.isFinite(endsAt) || endsAt < nowMs) return null;
  if (startsAt <= nowMs) return "scheduled-now";
  if (easternDayKey(new Date(startsAt)) === easternDayKey(now)) return "today";
  return "later";
}

/**
 * Prepare official, geocoded stops for the Near me panel. A schedule entry is
 * still only a published plan: this function adds distance and schedule timing,
 * never operator-confirmed live state.
 */
export function prepareNearbyPublishedStops(
  stops: readonly FoodTruckScheduleStop[],
  position: LngLat | null,
  now: Date,
): NearbyPublishedStop[] {
  return stops
    .flatMap((stop): NearbyPublishedStop[] => {
      const timing = stopTiming(stop, now);
      if (
        typeof stop.lat !== "number" ||
        !Number.isFinite(stop.lat) ||
        typeof stop.lng !== "number" ||
        !Number.isFinite(stop.lng) ||
        !timing
      ) {
        return [];
      }
      return [{
        ...stop,
        lat: stop.lat,
        lng: stop.lng,
        distance: position
          ? haversineMeters(position, { lat: stop.lat, lng: stop.lng })
          : null,
        timing,
      }];
    })
    .sort((a, b) => {
      const timingDifference = TIMING_ORDER[a.timing] - TIMING_ORDER[b.timing];
      if (timingDifference) return timingDifference;
      if (position && a.distance !== null && b.distance !== null) {
        const distanceDifference = a.distance - b.distance;
        if (distanceDifference) return distanceDifference;
      }
      const timeDifference = Date.parse(a.startsAt) - Date.parse(b.startsAt);
      return timeDifference || a.venueName.localeCompare(b.venueName);
    });
}
