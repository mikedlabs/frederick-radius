/**
 * TransIT Frederick County — GTFS-realtime vehicle positions (runtime).
 *
 * The county runs free fixed-route transit on a live GTFS feed (Passio).
 * This decodes the GTFS-realtime VehiclePositions protobuf into typed
 * live bus positions for the map, the Pulse "what's moving" layer, and
 * transit reachability in the radius. Static routes/stops/shapes live in
 * src/data/transit.json (built by scripts/build-transit-gtfs.ts).
 *
 * Realtime, so NOT cached — fetched no-store and polled client-side.
 * Graceful []: a feed hiccup never throws into a page.
 *
 * Source confirmed live 2026-06: feed returns ~14 vehicles mid-day,
 * positions near Frederick (39.4x, -77.4x) with bearings, route_ids that
 * match transit.json. Free to ride.
 */
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const VEHICLE_POSITIONS =
  "https://passio3.com/frederick/passioTransit/gtfs/realtime/vehiclePositions";
const TRIP_UPDATES =
  "https://passio3.com/frederick/passioTransit/gtfs/realtime/tripUpdates";
const TIMEOUT_MS = 10_000;

export type LiveVehicle = {
  vehicleId?: string;
  /** GTFS route_id — join to transit.json routes for name/color. */
  routeId?: string;
  tripId?: string;
  lat: number;
  lng: number;
  /** Compass bearing in degrees, when reported. */
  bearing?: number;
  /** Unix seconds of the position fix, when reported. */
  timestamp?: number;
};

async function decodeFeed(url: string) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Live bus positions. Returns [] on any failure. */
export async function getLiveVehicles(): Promise<LiveVehicle[]> {
  const feed = await decodeFeed(VEHICLE_POSITIONS);
  if (!feed) return [];
  const out: LiveVehicle[] = [];
  for (const e of feed.entity) {
    const v = e.vehicle;
    const pos = v?.position;
    if (!v || !pos || pos.latitude == null || pos.longitude == null) continue;
    out.push({
      vehicleId: v.vehicle?.id ?? undefined,
      routeId: v.trip?.routeId ?? undefined,
      tripId: v.trip?.tripId ?? undefined,
      lat: +pos.latitude.toFixed(5),
      lng: +pos.longitude.toFixed(5),
      bearing: pos.bearing != null ? Math.round(pos.bearing) : undefined,
      timestamp: v.timestamp != null ? Number(v.timestamp) : undefined,
    });
  }
  return out;
}

export type StopPrediction = { stopId: string; routeId?: string; arrivalEpoch?: number };

/**
 * Upcoming arrivals by stop (from TripUpdates). Flattened to per-stop
 * predictions for a "next bus here" lookup. Returns [] on failure.
 */
export async function getStopPredictions(): Promise<StopPrediction[]> {
  const feed = await decodeFeed(TRIP_UPDATES);
  if (!feed) return [];
  const out: StopPrediction[] = [];
  for (const e of feed.entity) {
    const tu = e.tripUpdate;
    if (!tu) continue;
    for (const stu of tu.stopTimeUpdate ?? []) {
      const arr = stu.arrival?.time;
      if (stu.stopId == null) continue;
      out.push({
        stopId: String(stu.stopId),
        routeId: tu.trip?.routeId ?? undefined,
        arrivalEpoch: arr != null ? Number(arr) : undefined,
      });
    }
  }
  return out;
}
