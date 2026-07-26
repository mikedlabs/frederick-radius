/**
 * MARC live train positions — MDOT MTA GTFS-realtime VehiclePositions.
 *
 * The statewide MARC feed is a public S3 object (no API key; confirmed on
 * mta.maryland.gov/developer-resources — the keyed Swiftly APIs cover Local
 * Bus / Light Rail / Metro / Commuter Bus, not MARC). Decoded server-side
 * (same pattern as transitRealtime.ts) and slimmed to what the map marker
 * needs, then filtered to the Brunswick Line corridor: the Frederick County
 * bbox expanded roughly 40 km, so a train approaching from Harpers Ferry or
 * Germantown is already on the map when the user looks.
 *
 * Realtime, so NOT cached — fetched no-store and polled client-side.
 * Graceful []: a feed hiccup never throws into a page.
 *
 * Source confirmed live 2026-07-18: feed decodes with tripIds ("Train492"),
 * route_ids matching the MARC GTFS (11704 Brunswick / 11705 Penn / 11706
 * Camden), positions, bearings, and per-fix timestamps. Only route 11704 is
 * retained; a geographic box alone also catches Penn Line trains.
 */
import { gtfsRealtime } from "@/lib/integrations/gtfsRealtimeBindings";

const VEHICLE_POSITIONS_URL =
  "https://mdotmta-gtfs-rt.s3.amazonaws.com/MARC+RT/marc-vp.pb";
const TIMEOUT_MS = 10_000;

/** Brunswick Line route_id from the official MTA static GTFS. */
export const BRUNSWICK_ROUTE_ID = "11704";

/**
 * Frederick County bbox (constants.FREDERICK_COUNTY_BOUNDS: -77.70..-77.08,
 * 39.20..39.74) expanded ~40 km on every side (0.36° lat; 0.47° lng at
 * 39.5°N). Duplicated as plain numbers so this lib stays importable from
 * node tests without dragging in the map component tree.
 */
export const MARC_CORRIDOR = {
  w: -78.17,
  e: -76.61,
  s: 38.84,
  n: 40.1,
} as const;

/** Is a fix inside the expanded Brunswick-corridor bbox? */
export function inMarcCorridor(lat: number, lng: number): boolean {
  return (
    lat >= MARC_CORRIDOR.s &&
    lat <= MARC_CORRIDOR.n &&
    lng >= MARC_CORRIDOR.w &&
    lng <= MARC_CORRIDOR.e
  );
}

export type MarcVehicle = {
  /** GTFS trip_id ("Train492"), falling back to the vehicle id — the stable
   *  marker key across polls. */
  tripId: string;
  /** Human line name ("Brunswick Line"), resolved from route_id. */
  line: string;
  lat: number;
  lng: number;
  /** Compass bearing in degrees, when reported. */
  bearing?: number;
  /** Unix seconds of the position fix — the client hides stale fixes. */
  updatedAt: number;
};

export type MarcVehicleFeedResult = {
  data: MarcVehicle[];
  status: "ok" | "unavailable";
  available: boolean;
  /** Provider-generated GTFS-RT feed timestamp, Unix seconds. */
  feedTimestamp?: number;
  /** When Radius finished receiving/decoding the response, Unix milliseconds. */
  receivedAt: number;
};

/** One decoded VehiclePosition, before slimming (pure-testable seam). */
export type RawMarcPosition = {
  tripId?: string | null;
  vehicleId?: string | null;
  routeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  bearing?: number | null;
  timestamp?: number | null;
};

/**
 * Slim decoded positions to the map payload: drop entries without a
 * coordinate, an identity, or a fix time (no timestamp means no honest
 * age-gating client-side), require the official Brunswick Line route id, and
 * then keep only fixes inside the expanded county corridor.
 */
export function slimMarcVehicles(raw: RawMarcPosition[]): MarcVehicle[] {
  const out: MarcVehicle[] = [];
  for (const r of raw) {
    const id = r.tripId ?? r.vehicleId;
    if (!id || r.lat == null || r.lng == null || r.timestamp == null) continue;
    if (r.routeId !== BRUNSWICK_ROUTE_ID) continue;
    if (!inMarcCorridor(r.lat, r.lng)) continue;
    out.push({
      tripId: id,
      line: "Brunswick Line",
      lat: +r.lat.toFixed(5),
      lng: +r.lng.toFixed(5),
      bearing: r.bearing != null ? Math.round(r.bearing) : undefined,
      updatedAt: Math.round(r.timestamp),
    });
  }
  return out;
}

// Minimal Long shape (protobufjs decodes 64-bit ints to Long by default).
type Long = { toNumber: () => number };
function toNum(v: number | Long | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = (v as { toNumber?: () => number }).toNumber?.();
  return typeof n === "number" ? n : null;
}

function feedTimestamp(v: number | Long | null | undefined): number | undefined {
  const timestamp = toNum(v);
  return timestamp != null && timestamp > 0 ? Math.round(timestamp) : undefined;
}

/** Live Brunswick Line trains plus provider availability/freshness metadata. */
export async function getMarcVehiclesResult(): Promise<MarcVehicleFeedResult> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(VEHICLE_POSITIONS_URL, {
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        data: [],
        status: "unavailable",
        available: false,
        receivedAt: Date.now(),
      };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const feed = gtfsRealtime.FeedMessage.decode(buf);
    const raw: RawMarcPosition[] = [];
    for (const e of feed.entity) {
      const v = e.vehicle;
      const pos = v?.position;
      if (!v || !pos) continue;
      raw.push({
        tripId: v.trip?.tripId ?? undefined,
        vehicleId: v.vehicle?.id ?? undefined,
        routeId: v.trip?.routeId ?? undefined,
        lat: pos.latitude ?? undefined,
        lng: pos.longitude ?? undefined,
        bearing: pos.bearing ?? undefined,
        timestamp: toNum(v.timestamp) ?? undefined,
      });
    }
    return {
      data: slimMarcVehicles(raw),
      status: "ok",
      available: true,
      feedTimestamp: feedTimestamp(feed.header.timestamp),
      receivedAt: Date.now(),
    };
  } catch {
    return {
      data: [],
      status: "unavailable",
      available: false,
      receivedAt: Date.now(),
    };
  } finally {
    clearTimeout(t);
  }
}

/** Compatibility helper; use getMarcVehiclesResult where feed state matters. */
export async function getMarcVehicles(): Promise<MarcVehicle[]> {
  return (await getMarcVehiclesResult()).data;
}
