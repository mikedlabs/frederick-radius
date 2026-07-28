export const SAVED_TRANSIT_STOPS_KEY = "fr.transit.saved-stops.v1";
export const MAX_SAVED_TRANSIT_STOPS = 6;
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

/** Parse the device-local v1 schema defensively and keep one row per stop. */
export function parseSavedTransitStops(raw: string | null): SavedTransitStop[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const stops: SavedTransitStop[] = [];
    for (const value of parsed) {
      if (!isStop(value) || seen.has(value.id)) continue;
      seen.add(value.id);
      stops.push({
        id: value.id,
        name: value.name,
        lat: value.lat,
        lng: value.lng,
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
