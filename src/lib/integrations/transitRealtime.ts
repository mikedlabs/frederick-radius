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
 * Existing array-returning helpers remain fail-soft for compatibility. Their
 * result-returning counterparts preserve provider availability and the GTFS-RT
 * feed timestamp so API consumers can distinguish no service from no feed.
 *
 * Source confirmed live 2026-06: feed returns ~14 vehicles mid-day,
 * positions near Frederick (39.4x, -77.4x) with bearings, route_ids that
 * match transit.json. Free to ride.
 */
import {
  gtfsRealtime,
  type GtfsFeedMessage,
} from "@/lib/integrations/gtfsRealtimeBindings";
import { decorateVehiclesWithNextStop } from "@/lib/integrations/transitNextStop";
import { createAbortDeadline } from "@/lib/promise-deadline";

const VEHICLE_POSITIONS =
  "https://passio3.com/frederick/passioTransit/gtfs/realtime/vehiclePositions";
const TRIP_UPDATES =
  "https://passio3.com/frederick/passioTransit/gtfs/realtime/tripUpdates";
const SERVICE_ALERTS =
  "https://passio3.com/frederick/passioTransit/gtfs/realtime/serviceAlerts";
const TIMEOUT_MS = 10_000;

export type TransitFeedStatus = "ok" | "degraded" | "unavailable";

export type TransitFeedMeta = {
  status: Exclude<TransitFeedStatus, "degraded">;
  available: boolean;
  /** Provider-generated GTFS-RT feed timestamp, Unix seconds. */
  feedTimestamp?: number;
  /** When Radius finished receiving/decoding the response, Unix milliseconds. */
  receivedAt: number;
};

export type TransitFeedResult<T> = {
  data: T;
  status: TransitFeedStatus;
  available: boolean;
  feedTimestamp?: number;
  receivedAt: number;
};

/** Where a bus is in its run, GTFS-rt VehiclePosition.current_status. */
export type VehicleStatus = "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO";

export type TripScheduleRelationship =
  | "SCHEDULED"
  | "ADDED"
  | "UNSCHEDULED"
  | "CANCELED"
  | "REPLACEMENT"
  | "DUPLICATED"
  | "DELETED"
  | "NEW";

export type StopScheduleRelationship =
  | "SCHEDULED"
  | "SKIPPED"
  | "NO_DATA"
  | "UNSCHEDULED";

/** A resolved next stop for a bus — name + coordinate from the static stop
 *  table, with the predicted arrival epoch (seconds) when TripUpdates has it.
 *  The flight-tracker "where's it headed + when." */
export type NextStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Unix seconds of predicted arrival (or departure fallback); omitted when
   *  the TripUpdates feed has no time for this stop. */
  etaEpoch?: number;
};

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
  /** GTFS stop_id the bus is currently at / approaching (the join seed for
   *  next-stop). String to match transit.json + TripUpdates stop ids. */
  stopId?: string;
  /** current_stop_sequence — the bus's position in its trip's stop list. */
  stopSequence?: number;
  /** INCOMING_AT / STOPPED_AT / IN_TRANSIT_TO — disambiguates whether
   *  `stopId` is the stop the bus is AT vs. heading to. */
  status?: VehicleStatus;
  /** The next stop, resolved server-side by joining to TripUpdates + the
   *  static stop table. Undefined when it can't be resolved honestly. */
  nextStop?: NextStop;
};

/** One stop in a trip's predicted timetable (from TripUpdates). */
export type TripStop = {
  stopId?: string;
  stopSequence?: number;
  arrivalEpoch?: number;
  departureEpoch?: number;
  scheduleRelationship?: StopScheduleRelationship;
};

/** A trip's predicted stop timetable, keyed back to its vehicle/route. */
export type TripUpdate = {
  tripId?: string;
  routeId?: string;
  vehicleId?: string;
  directionId?: number;
  scheduleRelationship?: TripScheduleRelationship;
  /** Provider timestamp for this trip update, Unix seconds. */
  timestamp?: number;
  stops: TripStop[];
};

/** Normalize current_status (protobufjs decodes the enum to its integer by
 *  default, but tolerate a string too). */
function vehicleStatus(raw: unknown): VehicleStatus | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string") {
    return raw === "INCOMING_AT" || raw === "STOPPED_AT" || raw === "IN_TRANSIT_TO"
      ? raw
      : undefined;
  }
  return raw === 0 ? "INCOMING_AT" : raw === 1 ? "STOPPED_AT" : raw === 2 ? "IN_TRANSIT_TO" : undefined;
}

function tripScheduleRelationship(
  raw: unknown,
): TripScheduleRelationship | undefined {
  if (typeof raw === "string") {
    return raw === "SCHEDULED" ||
      raw === "ADDED" ||
      raw === "UNSCHEDULED" ||
      raw === "CANCELED" ||
      raw === "REPLACEMENT" ||
      raw === "DUPLICATED" ||
      raw === "DELETED" ||
      raw === "NEW"
      ? raw
      : undefined;
  }
  return raw === 0
    ? "SCHEDULED"
    : raw === 1
      ? "ADDED"
      : raw === 2
        ? "UNSCHEDULED"
        : raw === 3
          ? "CANCELED"
          : raw === 5
            ? "REPLACEMENT"
            : raw === 6
              ? "DUPLICATED"
              : raw === 7
                ? "DELETED"
                : raw === 8
                  ? "NEW"
                  : undefined;
}

function stopScheduleRelationship(
  raw: unknown,
): StopScheduleRelationship | undefined {
  if (typeof raw === "string") {
    return raw === "SCHEDULED" ||
      raw === "SKIPPED" ||
      raw === "NO_DATA" ||
      raw === "UNSCHEDULED"
      ? raw
      : undefined;
  }
  return raw === 0
    ? "SCHEDULED"
    : raw === 1
      ? "SKIPPED"
      : raw === 2
        ? "NO_DATA"
        : raw === 3
          ? "UNSCHEDULED"
          : undefined;
}

type Long = { toNumber: () => number };

function toNumber(value: number | Long | null | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const converted = value.toNumber?.();
  return typeof converted === "number" && Number.isFinite(converted)
    ? converted
    : undefined;
}

function feedTimestamp(value: number | Long | null | undefined): number | undefined {
  const timestamp = toNumber(value);
  return timestamp != null && timestamp > 0 ? Math.round(timestamp) : undefined;
}

type DecodedFeed = TransitFeedMeta & {
  feed?: GtfsFeedMessage;
};

async function decodeFeed(
  url: string,
  parentSignal?: AbortSignal,
): Promise<DecodedFeed> {
  const deadline = createAbortDeadline(TIMEOUT_MS, parentSignal);
  try {
    const res = await fetch(url, {
      signal: deadline.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return { status: "unavailable", available: false, receivedAt: Date.now() };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const feed = gtfsRealtime.FeedMessage.decode(buf);
    return {
      feed,
      status: "ok",
      available: true,
      feedTimestamp: feedTimestamp(feed.header.timestamp),
      receivedAt: Date.now(),
    };
  } catch {
    return { status: "unavailable", available: false, receivedAt: Date.now() };
  } finally {
    deadline.dispose();
  }
}

function vehiclesFromFeed(
  feed: GtfsFeedMessage,
): LiveVehicle[] {
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
      timestamp: toNumber(v.timestamp),
      // The stop the bus is at / heading to — the seed for the next-stop
      // join. The Passio feed carries both of these on the vehicle entity.
      stopId: v.stopId != null ? String(v.stopId) : undefined,
      stopSequence: v.currentStopSequence != null ? Number(v.currentStopSequence) : undefined,
      status: vehicleStatus(v.currentStatus),
    });
  }
  return out;
}

/** Live bus positions plus honest provider availability/freshness metadata. */
export async function getLiveVehiclesResult(): Promise<TransitFeedResult<LiveVehicle[]>> {
  const decoded = await decodeFeed(VEHICLE_POSITIONS);
  return {
    data: decoded.feed ? vehiclesFromFeed(decoded.feed) : [],
    status: decoded.status,
    available: decoded.available,
    feedTimestamp: decoded.feedTimestamp,
    receivedAt: decoded.receivedAt,
  };
}

/** Live bus positions. Compatibility helper; use getLiveVehiclesResult in APIs. */
export async function getLiveVehicles(): Promise<LiveVehicle[]> {
  return (await getLiveVehiclesResult()).data;
}

/**
 * Per-trip predicted stop timetables (from TripUpdates). Unlike
 * getStopPredictions (a flat per-stop "next bus here" view), this keeps each
 * trip's full stop list WITH stopSequence + tripId, so a moving vehicle can be
 * joined to its own next stop + ETA. Returns [] on any failure.
 */
function tripUpdatesFromFeed(
  feed: GtfsFeedMessage,
): TripUpdate[] {
  const out: TripUpdate[] = [];
  for (const e of feed.entity) {
    const tu = e.tripUpdate;
    if (!tu) continue;
    const stops: TripStop[] = [];
    for (const stu of tu.stopTimeUpdate ?? []) {
      const arr = stu.arrival?.time;
      const dep = stu.departure?.time;
      stops.push({
        stopId: stu.stopId != null ? String(stu.stopId) : undefined,
        stopSequence: stu.stopSequence != null ? Number(stu.stopSequence) : undefined,
        arrivalEpoch: toNumber(arr),
        departureEpoch: toNumber(dep),
        scheduleRelationship: stopScheduleRelationship(
          stu.scheduleRelationship,
        ),
      });
    }
    out.push({
      tripId: tu.trip?.tripId ?? undefined,
      routeId: tu.trip?.routeId ?? undefined,
      vehicleId: tu.vehicle?.id ?? undefined,
      directionId:
        tu.trip?.directionId != null
          ? Number(tu.trip.directionId)
          : undefined,
      scheduleRelationship: tripScheduleRelationship(
        tu.trip?.scheduleRelationship,
      ),
      timestamp: toNumber(tu.timestamp),
      stops,
    });
  }
  return out;
}

/** Per-trip predictions plus provider availability/freshness metadata. */
export async function getTripUpdatesResult(): Promise<TransitFeedResult<TripUpdate[]>> {
  const decoded = await decodeFeed(TRIP_UPDATES);
  return {
    data: decoded.feed ? tripUpdatesFromFeed(decoded.feed) : [],
    status: decoded.status,
    available: decoded.available,
    feedTimestamp: decoded.feedTimestamp,
    receivedAt: decoded.receivedAt,
  };
}

/** Compatibility helper; use getTripUpdatesResult where feed state matters. */
export async function getTripUpdates(): Promise<TripUpdate[]> {
  return (await getTripUpdatesResult()).data;
}

export type LiveVehiclesResult = TransitFeedResult<LiveVehicle[]> & {
  feeds: {
    vehiclePositions: TransitFeedMeta;
    tripUpdates: TransitFeedMeta;
  };
};

/**
 * Live buses, each decorated with their resolved NEXT stop (name + coord +
 * ETA). Fetches both realtime feeds in parallel (VehiclePositions for the
 * positions, TripUpdates for the ETAs) and joins them via the pure next-stop
 * resolver. Both feeds are fail-soft, so a TripUpdates hiccup degrades to
 * positions-only (no nextStop) rather than throwing. Returns [] when there are
 * no vehicles.
 */
export async function getLiveVehiclesWithNextStop(): Promise<LiveVehicle[]> {
  return (await getLiveVehiclesWithNextStopResult()).data;
}

/**
 * Decorated vehicle positions with separate metadata for both upstream feeds.
 * Vehicle positions remain usable when TripUpdates is down; the result is then
 * marked degraded and simply omits next-stop predictions.
 */
export async function getLiveVehiclesWithNextStopResult(): Promise<LiveVehiclesResult> {
  const [vehicles, updates] = await Promise.all([
    getLiveVehiclesResult(),
    getTripUpdatesResult(),
  ]);
  const data =
    vehicles.data.length === 0
      ? vehicles.data
      : decorateVehiclesWithNextStop(vehicles.data, updates.data);
  const status: TransitFeedStatus = !vehicles.available
    ? "unavailable"
    : updates.available
      ? "ok"
      : "degraded";

  return {
    data,
    status,
    available: vehicles.available,
    feedTimestamp: vehicles.feedTimestamp,
    receivedAt: Math.max(vehicles.receivedAt, updates.receivedAt),
    feeds: {
      vehiclePositions: {
        status: vehicles.available ? "ok" : "unavailable",
        available: vehicles.available,
        feedTimestamp: vehicles.feedTimestamp,
        receivedAt: vehicles.receivedAt,
      },
      tripUpdates: {
        status: updates.available ? "ok" : "unavailable",
        available: updates.available,
        feedTimestamp: updates.feedTimestamp,
        receivedAt: updates.receivedAt,
      },
    },
  };
}

export type StopPrediction = {
  stopId: string;
  routeId?: string;
  tripId?: string;
  vehicleId?: string;
  directionId?: number;
  stopSequence?: number;
  arrivalEpoch?: number;
  /** Provider timestamp for the individual TripUpdate, Unix seconds. */
  timestamp?: number;
  tripScheduleRelationship?: TripScheduleRelationship;
  scheduleRelationship?: StopScheduleRelationship;
};

function stopPredictionsFromFeed(
  feed: GtfsFeedMessage,
): StopPrediction[] {
  const out: StopPrediction[] = [];
  for (const e of feed.entity) {
    const tu = e.tripUpdate;
    if (!tu) continue;
    const tripRelationship = tripScheduleRelationship(
      tu.trip?.scheduleRelationship,
    );
    // This endpoint answers "which buses are still expected to stop here?"
    // A canceled/deleted trip is useful disruption data, but it is not an
    // inbound arrival and must never reach catchability UI.
    if (
      tripRelationship === "CANCELED" ||
      tripRelationship === "DELETED"
    ) {
      continue;
    }
    for (const stu of tu.stopTimeUpdate ?? []) {
      const arr = stu.arrival?.time;
      const dep = stu.departure?.time;
      if (stu.stopId == null) continue;
      const stopRelationship = stopScheduleRelationship(
        stu.scheduleRelationship,
      );
      // GTFS-realtime SKIPPED means this vehicle will not call at the stop.
      // Omitting it is safer than showing a countdown for a bus that passes by.
      if (stopRelationship === "SKIPPED") continue;
      out.push({
        stopId: String(stu.stopId),
        routeId: tu.trip?.routeId ?? undefined,
        tripId: tu.trip?.tripId ?? undefined,
        vehicleId: tu.vehicle?.id ?? undefined,
        directionId:
          tu.trip?.directionId != null
            ? Number(tu.trip.directionId)
            : undefined,
        stopSequence:
          stu.stopSequence != null ? Number(stu.stopSequence) : undefined,
        arrivalEpoch: toNumber(arr) ?? toNumber(dep),
        timestamp: toNumber(tu.timestamp),
        tripScheduleRelationship: tripRelationship,
        scheduleRelationship: stopRelationship,
      });
    }
  }
  return out;
}

/** Upcoming arrivals plus provider availability/freshness metadata. */
export async function getStopPredictionsResult(
  signal?: AbortSignal,
): Promise<
  TransitFeedResult<StopPrediction[]>
> {
  const decoded = await decodeFeed(TRIP_UPDATES, signal);
  return {
    data: decoded.feed ? stopPredictionsFromFeed(decoded.feed) : [],
    status: decoded.status,
    available: decoded.available,
    feedTimestamp: decoded.feedTimestamp,
    receivedAt: decoded.receivedAt,
  };
}

/**
 * Upcoming arrivals by stop (from TripUpdates). Flattened to per-stop
 * predictions for a "next bus here" lookup. Compatibility helper; use
 * getStopPredictionsResult where feed state matters.
 */
export async function getStopPredictions(): Promise<StopPrediction[]> {
  return (await getStopPredictionsResult()).data;
}

export type TransitServiceAlert = {
  id: string;
  header: string;
  description?: string;
  routeIds: string[];
  stopIds: string[];
  activePeriods: Array<{ start?: number; end?: number }>;
  cause?: string;
  effect?: string;
};

const ALERT_CAUSES: Record<number, string> = {
  1: "Unknown cause",
  2: "Other cause",
  3: "Technical problem",
  4: "Strike",
  5: "Demonstration",
  6: "Accident",
  7: "Holiday",
  8: "Weather",
  9: "Maintenance",
  10: "Construction",
  11: "Police activity",
  12: "Medical emergency",
};

const ALERT_EFFECTS: Record<number, string> = {
  1: "No service",
  2: "Reduced service",
  3: "Significant delays",
  4: "Detour",
  5: "Additional service",
  6: "Modified service",
  7: "Other effect",
  8: "Unknown effect",
  9: "Stop moved",
  10: "No effect",
  11: "Accessibility issue",
};

function enumLabel(
  raw: unknown,
  labels: Record<number, string>,
): string | undefined {
  if (typeof raw === "string") {
    const normalized = raw
      .toLocaleLowerCase()
      .replaceAll("_", " ")
      .replace(/^\w/, (letter) => letter.toLocaleUpperCase());
    return normalized || undefined;
  }
  return typeof raw === "number" ? labels[raw] : undefined;
}

function translatedText(
  value:
    | { translation?: Array<{ text?: string | null }> | null }
    | null
    | undefined,
): string | undefined {
  return value?.translation
    ?.map((translation) => translation.text?.trim())
    .find((text): text is string => Boolean(text));
}

function serviceAlertsFromFeed(feed: GtfsFeedMessage): TransitServiceAlert[] {
  return feed.entity.flatMap((entity, index) => {
    const alert = entity.alert;
    const header = translatedText(alert?.headerText);
    if (!alert || !header) return [];
    const selectors = alert.informedEntity ?? [];
    return [
      {
        id: entity.id?.trim() || `alert-${index + 1}`,
        header,
        description: translatedText(alert.descriptionText),
        routeIds: Array.from(
          new Set(
            selectors
              .map((selector) => selector.routeId?.trim())
              .filter((routeId): routeId is string => Boolean(routeId)),
          ),
        ),
        stopIds: Array.from(
          new Set(
            selectors
              .map((selector) => selector.stopId?.trim())
              .filter((stopId): stopId is string => Boolean(stopId)),
          ),
        ),
        activePeriods: (alert.activePeriod ?? []).map((period) => ({
          start: toNumber(period.start),
          end: toNumber(period.end),
        })),
        cause: enumLabel(alert.cause, ALERT_CAUSES),
        effect: enumLabel(alert.effect, ALERT_EFFECTS),
      },
    ];
  });
}

/** Provider-published bus disruptions with explicit feed availability. An
 * empty successful feed means only that no alert entity was published; callers
 * must not turn that into a broader "service normal" promise. */
export async function getTransitServiceAlertsResult(
  signal?: AbortSignal,
): Promise<
  TransitFeedResult<TransitServiceAlert[]>
> {
  const decoded = await decodeFeed(SERVICE_ALERTS, signal);
  return {
    data: decoded.feed ? serviceAlertsFromFeed(decoded.feed) : [],
    status: decoded.status,
    available: decoded.available,
    feedTimestamp: decoded.feedTimestamp,
    receivedAt: decoded.receivedAt,
  };
}
