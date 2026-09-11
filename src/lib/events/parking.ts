import {
  PARKING_GARAGES,
  PARKING_RATE_SCHEDULE,
} from "@/data/parking-garages";
import {
  formatDistance,
  haversineMeters,
  type LngLat,
} from "@/lib/geo";

export type EventParkingDecision = {
  slug: string;
  name: string;
  distanceM: number;
  distanceLabel: string;
};

/**
 * One canonical city-garage decision for event detail. Both the summary near
 * the hero and the Getting there section receive this same value, preventing
 * two catalogs or distance calculations from naming different "closest"
 * garages on one page.
 */
export function nearestEventParking(
  origin: LngLat,
  maxDistanceM = 1_100,
): EventParkingDecision | null {
  let best: EventParkingDecision | null = null;
  for (const garage of PARKING_GARAGES) {
    if (!garage.geom) continue;
    const distanceM = haversineMeters(origin, garage.geom);
    if (distanceM > maxDistanceM || (best && distanceM >= best.distanceM)) {
      continue;
    }
    best = {
      slug: garage.slug,
      name: garage.name,
      distanceM,
      distanceLabel: formatDistance(distanceM),
    };
  }
  return best;
}

export function eventParkingSummary(
  parking: EventParkingDecision | null,
): string | null {
  if (!parking) return null;
  return `${parking.name} is the nearest listed city garage, ${parking.distanceLabel} away in a straight line.`;
}

export function eventParkingDirections(
  parking: EventParkingDecision | null,
): string | null {
  if (!parking) return null;
  const overnightMaximum = PARKING_RATE_SCHEDULE.nighttimeMax.replace(
    /\s+max$/,
    "",
  );
  return `${parking.name} is ${parking.distanceLabel} away in a straight line. Garage parking is ${PARKING_RATE_SCHEDULE.hourly}; the overnight maximum is ${overnightMaximum}. Check the route and current rates before leaving.`;
}
