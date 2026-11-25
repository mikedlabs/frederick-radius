import {
  PARKING_GARAGES,
  garageRateSummary,
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
  eventDay?: string,
): string | null {
  if (!parking) return null;
  const rateDate = eventDay ? new Date(`${eventDay}T12:00:00-05:00`) : new Date();
  return `${parking.name} is ${parking.distanceLabel} away in a straight line. City garage rates: ${garageRateSummary(rateDate)}.`;
}
