export const SAVED_TRANSIT_STOPS_KEY = "fr.transit.saved-stops.v1";
export const MAX_SAVED_TRANSIT_STOPS = 6;
export const SAVED_TRANSIT_BUSES_KEY = "fr.transit.saved-buses.v1";
export const MAX_SAVED_TRANSIT_BUSES = 6;
export const CATCH_BUFFER_MINUTES = 2;
export const TRANSIT_PREDICTION_FRESH_MS = 90_000;

export type TransitStopRef = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export type SavedTransitStop = TransitStopRef & {
  savedAt: string;
};

export type SavedStopToggleResult = {
  stops: SavedTransitStop[];
  saved: boolean;
  limitReached: boolean;
};

export type TransitBusRef = {
  vehicleId: string;
  tripId?: string;
  routeId?: string;
  routeShort?: string;
  routeName?: string;
  directionId?: number;
  headsign?: string;
  targetStop?: TransitStopRef;
  lastSeenAt?: number;
};

export type SavedTransitBus = TransitBusRef & {
  watchId: string;
  savedAt: string;
};

export type SavedBusToggleResult = {
  buses: SavedTransitBus[];
  saved: boolean;
  limitReached: boolean;
};

type StoredTransitBus = Omit<SavedTransitBus, "watchId"> & {
  watchId?: string;
};

export type Catchability =
  | { kind: "likely"; label: "Likely catchable" }
  | { kind: "tight"; label: "Leave now. Timing is tight." }
  | { kind: "too-tight"; label: "Probably too tight" };

function isStop(value: unknown): value is SavedTransitStop {
  if (!value || typeof value !== "object") return false;
  const stop = value as Partial<SavedTransitStop>;
  return (
    typeof stop.id === "string" &&
    stop.id.trim().length > 0 &&
    typeof stop.name === "string" &&
    stop.name.trim().length > 0 &&
    typeof stop.lat === "number" &&
    Number.isFinite(stop.lat) &&
    Math.abs(stop.lat) <= 90 &&
    typeof stop.lng === "number" &&
    Number.isFinite(stop.lng) &&
    Math.abs(stop.lng) <= 180 &&
    typeof stop.savedAt === "string" &&
    stop.savedAt.length > 0
  );
}

function isBus(value: unknown): value is StoredTransitBus {
  if (!value || typeof value !== "object") return false;
  const bus = value as Partial<StoredTransitBus>;
  return (
    typeof bus.vehicleId === "string" &&
    bus.vehicleId.trim().length > 0 &&
    (bus.tripId == null ||
      (typeof bus.tripId === "string" && bus.tripId.trim().length > 0)) &&
    (bus.routeId == null ||
      (typeof bus.routeId === "string" && bus.routeId.trim().length > 0)) &&
    (bus.routeShort == null || typeof bus.routeShort === "string") &&
    (bus.routeName == null || typeof bus.routeName === "string") &&
    (bus.directionId == null ||
      (Number.isInteger(bus.directionId) &&
        bus.directionId >= 0 &&
        bus.directionId <= 1)) &&
    (bus.headsign == null || typeof bus.headsign === "string") &&
    (bus.targetStop == null ||
      (typeof bus.targetStop.id === "string" &&
        bus.targetStop.id.trim().length > 0 &&
        typeof bus.targetStop.name === "string" &&
        bus.targetStop.name.trim().length > 0 &&
        typeof bus.targetStop.lat === "number" &&
        Number.isFinite(bus.targetStop.lat) &&
        Math.abs(bus.targetStop.lat) <= 90 &&
        typeof bus.targetStop.lng === "number" &&
        Number.isFinite(bus.targetStop.lng) &&
        Math.abs(bus.targetStop.lng) <= 180)) &&
    (bus.lastSeenAt == null ||
      (typeof bus.lastSeenAt === "number" &&
        Number.isFinite(bus.lastSeenAt) &&
        bus.lastSeenAt > 0)) &&
    (bus.watchId == null ||
      (typeof bus.watchId === "string" && bus.watchId.trim().length > 0)) &&
    typeof bus.savedAt === "string" &&
    bus.savedAt.length > 0
  );
}

/**
 * Parse the device-local v1 schema defensively and keep one row per stop.
 * When the current GTFS stop list is supplied, removed ids are pruned before
 * the six-stop cap and names/coordinates are refreshed from the new snapshot.
 */
export function parseSavedTransitStops(
  raw: string | null,
  currentStops?: readonly TransitStopRef[],
): SavedTransitStop[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const currentById = currentStops
      ? new Map(currentStops.map((stop) => [stop.id, stop]))
      : null;
    const seen = new Set<string>();
    const stops: SavedTransitStop[] = [];
    for (const value of parsed) {
      if (!isStop(value) || seen.has(value.id)) continue;
      const current = currentById?.get(value.id);
      if (currentById && !current) continue;
      seen.add(value.id);
      stops.push({
        id: value.id,
        name: current?.name ?? value.name,
        lat: current?.lat ?? value.lat,
        lng: current?.lng ?? value.lng,
        savedAt: value.savedAt,
      });
      if (stops.length === MAX_SAVED_TRANSIT_STOPS) break;
    }
    return stops;
  } catch {
    return [];
  }
}

/** Toggle a stop without silently evicting a different saved stop. */
export function toggleSavedTransitStop(
  current: readonly SavedTransitStop[],
  stop: TransitStopRef,
  savedAt: string,
): SavedStopToggleResult {
  const exists = current.some((item) => item.id === stop.id);
  if (exists) {
    return {
      stops: current.filter((item) => item.id !== stop.id),
      saved: false,
      limitReached: false,
    };
  }
  if (current.length >= MAX_SAVED_TRANSIT_STOPS) {
    return { stops: [...current], saved: false, limitReached: true };
  }
  return {
    stops: [{ ...stop, savedAt }, ...current],
    saved: true,
    limitReached: false,
  };
}

/**
 * Parse saved bus trips without trusting stale coordinates. When the current
 * GTFS stop list is supplied, target-stop context is canonicalized or removed
 * if it is no longer rider-selectable.
 */
export function parseSavedTransitBuses(
  raw: string | null,
  currentStops?: readonly TransitStopRef[],
): SavedTransitBus[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const currentById = currentStops
      ? new Map(currentStops.map((stop) => [stop.id, stop]))
      : null;
    const seen = new Set<string>();
    const buses: SavedTransitBus[] = [];
    for (const value of parsed) {
      if (!isBus(value)) continue;
      const watchId = transitBusWatchId(value);
      if (seen.has(watchId)) continue;
      const currentTarget = value.targetStop
        ? currentById?.get(value.targetStop.id)
        : undefined;
      seen.add(watchId);
      buses.push({
        watchId,
        vehicleId: value.vehicleId,
        tripId: value.tripId,
        routeId: value.routeId,
        routeShort: value.routeShort,
        routeName: value.routeName,
        directionId: value.directionId,
        headsign: value.headsign,
        targetStop:
          value.targetStop && (!currentById || currentTarget)
          ? {
              id: currentTarget?.id ?? value.targetStop.id,
              name: currentTarget?.name ?? value.targetStop.name,
              lat: currentTarget?.lat ?? value.targetStop.lat,
              lng: currentTarget?.lng ?? value.targetStop.lng,
            }
          : undefined,
        lastSeenAt: value.lastSeenAt,
        savedAt: value.savedAt,
      });
      if (buses.length === MAX_SAVED_TRANSIT_BUSES) break;
    }
    return buses;
  } catch {
    return [];
  }
}

export function transitBusWatchId(bus: TransitBusRef): string {
  return bus.tripId
    ? `${bus.vehicleId}:${bus.tripId}`
    : bus.vehicleId;
}

/**
 * Trip identity is the durable match. It rejects a physical bus reused on a
 * later run while still allowing the agency to substitute another vehicle on
 * the same trip.
 */
export function savedTransitBusMatchesVehicle(
  saved: SavedTransitBus,
  candidate: Pick<TransitBusRef, "vehicleId" | "tripId" | "routeId">,
): boolean {
  // Without a trip id, a physical bus can be reused later on the same route.
  // Keep that older save useful as route/stop context, but never call it live.
  if (!saved.tripId) return false;
  if (candidate.tripId !== saved.tripId) return false;
  if (saved.routeId && candidate.routeId !== saved.routeId) return false;
  return true;
}

/**
 * Save the exact reported run plus enough route/stop context to remain useful
 * after that run ends. Bus coordinates are intentionally never persisted.
 */
export function toggleSavedTransitBus(
  current: readonly SavedTransitBus[],
  bus: TransitBusRef,
  savedAt: string,
): SavedBusToggleResult {
  const watchId = transitBusWatchId(bus);
  const exists = current.some((item) => item.watchId === watchId);
  if (exists) {
    return {
      buses: current.filter((item) => item.watchId !== watchId),
      saved: false,
      limitReached: false,
    };
  }
  if (current.length >= MAX_SAVED_TRANSIT_BUSES) {
    return { buses: [...current], saved: false, limitReached: true };
  }
  return {
    buses: [{ ...bus, watchId, savedAt }, ...current],
    saved: true,
    limitReached: false,
  };
}

/**
 * A deliberately conservative rough walk estimate. Straight-line distance is
 * inflated 30% for turns and crossings, then divided by a moderate 75 m/min
 * walking pace. It is an estimate, never accessible-route guidance.
 */
export function estimateWalkingMinutes(distanceMeters: number): number | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
  return Math.max(1, Math.ceil((distanceMeters * 1.3) / 75));
}

/** Whole minutes until an arrival, rounded down so catch advice errs early. */
export function minutesUntilArrival(
  arrivalEpoch: number | undefined,
  nowMs: number,
): number | null {
  if (
    arrivalEpoch == null ||
    !Number.isFinite(arrivalEpoch) ||
    !Number.isFinite(nowMs) ||
    nowMs <= 0
  ) {
    return null;
  }
  const minutes = Math.floor((arrivalEpoch * 1000 - nowMs) / 60_000);
  return minutes >= 0 && minutes <= 90 ? minutes : null;
}

/**
 * A prediction can carry its own GTFS-realtime timestamp. When it does, use
 * that more precise age instead of a fresh feed header. Older rows stay
 * displayable, but should not receive catch advice.
 */
export function isPredictionFresh(
  predictionTimestamp: number | undefined,
  nowMs: number,
  feedLiveAndFresh: boolean,
): boolean {
  if (!feedLiveAndFresh || !Number.isFinite(nowMs) || nowMs <= 0) {
    return false;
  }
  if (predictionTimestamp == null) return true;
  if (
    !Number.isFinite(predictionTimestamp) ||
    predictionTimestamp <= 0
  ) {
    return false;
  }
  const timestampMs =
    predictionTimestamp > 1_000_000_000_000
      ? predictionTimestamp
      : predictionTimestamp * 1000;
  return Math.abs(nowMs - timestampMs) <= TRANSIT_PREDICTION_FRESH_MS;
}

/**
 * Catch advice is allowed only for a fresh live prediction plus a location-
 * derived walk estimate. Labels remain probabilistic because neither the
 * walking path and provider ETA are both approximate.
 */
export function deriveCatchability(
  arrivalMinutes: number | null,
  walkingMinutes: number | null,
  liveAndFresh: boolean,
): Catchability | null {
  if (
    !liveAndFresh ||
    arrivalMinutes == null ||
    walkingMinutes == null
  ) {
    return null;
  }
  if (arrivalMinutes < walkingMinutes) {
    return { kind: "too-tight", label: "Probably too tight" };
  }
  if (arrivalMinutes < walkingMinutes + CATCH_BUFFER_MINUTES) {
    return { kind: "tight", label: "Leave now. Timing is tight." };
  }
  return { kind: "likely", label: "Likely catchable" };
}
