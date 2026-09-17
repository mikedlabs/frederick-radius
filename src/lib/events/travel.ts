import { MARC_STATIONS } from "@/data/marc-stations";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";

/** Station proximity is orientation, never evidence of service or a walking route. */
export function eventNearbyStation(origin: LngLat): { name: string; distanceLabel: string } | null {
  const nearest = MARC_STATIONS.map((station) => ({
    station,
    meters: haversineMeters(origin, station),
  })).filter(({ meters }) => meters <= 1_000).sort((a, b) => a.meters - b.meters)[0];
  return nearest ? { name: nearest.station.name, distanceLabel: formatDistance(nearest.meters) } : null;
}
