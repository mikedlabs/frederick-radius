/**
 * MARC Brunswick Line stations in Frederick County.
 *
 * Verified from the official MTA Maryland static GTFS
 * (feeds.mta.maryland.gov/gtfs/marc, stops.txt, dated 2026-05-14). Each
 * station has an eastbound and a westbound platform with its own
 * stop_id, which is how the realtime stop_time_updates key their
 * predictions, so both are listed. Coordinates are the GTFS stop_lat /
 * stop_lon, accurate to the platform.
 *
 * These four are the only MARC stations inside Frederick County. The
 * Brunswick Line runs commuter service (weekday-heavy, sparse midday
 * and weekend), which is why the "next train" card is schedule-backed
 * rather than realtime-only: the live feed alone would read empty most
 * of the day.
 *
 * "eb" / "wb" follow the GTFS stop_name suffixes. Eastbound runs toward
 * Washington (the commute-in direction); westbound runs back out toward
 * Brunswick and the Frederick spur.
 */

export type MarcDirection = "eb" | "wb";

export type MarcStation = {
  /** Stable key for routing and the map layer. */
  key: string;
  name: string;
  lat: number;
  lng: number;
  /** GTFS stop_id per direction. The realtime feed keys on these. */
  stopIds: Record<MarcDirection, string>;
};

export const MARC_STATIONS: MarcStation[] = [
  {
    key: "frederick",
    name: "Frederick",
    lat: 39.411687,
    lng: -77.40515,
    stopIds: { eb: "11944", wb: "11972" },
  },
  {
    key: "monocacy",
    name: "Monocacy",
    lat: 39.382593,
    lng: -77.39444,
    stopIds: { eb: "11945", wb: "11971" },
  },
  {
    key: "point-of-rocks",
    name: "Point of Rocks",
    lat: 39.273486,
    lng: -77.533735,
    stopIds: { eb: "11946", wb: "11970" },
  },
  {
    key: "brunswick",
    name: "Brunswick",
    lat: 39.312002,
    lng: -77.627908,
    stopIds: { eb: "11943", wb: "11973" },
  },
];

/** Every county station stop_id (both directions), for fast membership tests. */
export const MARC_STOP_IDS: Set<string> = new Set(
  MARC_STATIONS.flatMap((s) => [s.stopIds.eb, s.stopIds.wb]),
);

/** Resolve a stop_id to its station + direction. Undefined for any
 *  stop_id outside the county. */
export function stationForStopId(
  stopId: string,
): { station: MarcStation; direction: MarcDirection } | undefined {
  for (const station of MARC_STATIONS) {
    if (station.stopIds.eb === stopId) return { station, direction: "eb" };
    if (station.stopIds.wb === stopId) return { station, direction: "wb" };
  }
  return undefined;
}
