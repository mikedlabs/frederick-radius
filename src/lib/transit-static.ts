import TRANSIT from "@/data/transit.json";
import TRANSIT_NETWORK from "@/data/transit-network.json";

export type CurrentTransitStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  wc?: boolean;
};

const STOP_ROUTES = (
  TRANSIT_NETWORK as {
    stopRoutes?: Record<string, string[]>;
  }
).stopRoutes ?? {};

/**
 * Stops that appear in at least one current static-GTFS stop_time. The feed
 * can retain old, announcement-only, or otherwise non-served stop records;
 * those are useful source data but should not be offered as places where a
 * rider can board today.
 */
export const CURRENT_TRANSIT_STOPS: CurrentTransitStop[] = (
  TRANSIT.stops as Array<{
    id: string | number;
    name: string;
    lat: number;
    lng: number;
    wc?: boolean;
  }>
)
  .filter((stop) => (STOP_ROUTES[String(stop.id)]?.length ?? 0) > 0)
  .map((stop) => ({
    id: String(stop.id),
    name: stop.name,
    lat: stop.lat,
    lng: stop.lng,
    wc: stop.wc,
  }));

const CURRENT_STOP_IDS = new Set(
  CURRENT_TRANSIT_STOPS.map((stop) => stop.id),
);

export function isCurrentTransitStop(stopId: string): boolean {
  return CURRENT_STOP_IDS.has(String(stopId));
}

export const CURRENT_TRANSIT_STOP_COUNT = CURRENT_TRANSIT_STOPS.length;
