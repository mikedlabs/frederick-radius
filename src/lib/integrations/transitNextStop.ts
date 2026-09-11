/**
 * Next-stop join — the flight-tracker brain for live buses.
 *
 * Given the live VehiclePositions (each bus reports the stop it's at /
 * heading to, via stopId + currentStopSequence + current_status) and the live
 * TripUpdates (each trip's predicted stop timetable), this resolves, for each
 * vehicle, its NEXT stop: a human name + coordinate (from the static stop
 * table in transit.json) and a predicted arrival epoch.
 *
 * PURE + framework-free so it's unit-testable against captured feed shapes:
 * resolveNextStop() takes injected lookups (no network, no import side
 * effects). decorateVehiclesWithNextStop() wires it to the shipped stop table.
 *
 * Honest by construction: when the next stop can't be named (no stop in the
 * static table, deadheading bus with no trip, or a STOPPED_AT bus whose
 * following stop isn't in TripUpdates) it returns undefined — the UI shows
 * nothing rather than guessing a stop.
 */
import TRANSIT from "@/data/transit.json";
import type { LiveVehicle, NextStop, TripUpdate, TripStop } from "@/lib/integrations/transitRealtime";

export type StopMeta = { id: string; name: string; lat: number; lng: number };

/** stopId -> static stop metadata, from transit.json (386 stops). */
export const STOP_BY_ID: Record<string, StopMeta> = Object.fromEntries(
  (TRANSIT.stops as StopMeta[]).map((s) => [String(s.id), { ...s, id: String(s.id) }]),
);

/** Index TripUpdates by tripId for an O(1) vehicle join. */
export function tripUpdatesByTripId(updates: TripUpdate[]): Map<string, TripUpdate> {
  const m = new Map<string, TripUpdate>();
  for (const tu of updates) if (tu.tripId) m.set(tu.tripId, tu);
  return m;
}

const stuTime = (s: TripStop): number | undefined => s.arrivalEpoch ?? s.departureEpoch;
const realtimeEta = (s: TripStop): number | undefined =>
  s.scheduleRelationship === "NO_DATA" ? undefined : stuTime(s);
const bySeq = (a: TripStop, b: TripStop): number =>
  (a.stopSequence ?? Number.POSITIVE_INFINITY) - (b.stopSequence ?? Number.POSITIVE_INFINITY);

function nextCallableStop(
  stops: TripStop[],
  afterSequence: number,
): TripStop | undefined {
  return stops
    .filter(
      (s) =>
        s.stopSequence != null &&
        s.stopSequence > afterSequence &&
        s.scheduleRelationship !== "SKIPPED",
    )
    .sort(bySeq)[0];
}

/**
 * Find the trip-timetable entry for the stop the vehicle reports (by stopId).
 * On a loop/out-and-back trip the same physical stopId appears more than once;
 * `after` (the vehicle's last report epoch) disambiguates by preferring the
 * UPCOMING occurrence — the lap the bus hasn't served yet — over an
 * already-passed one. Falls back to the earliest-by-sequence when there's no
 * timestamp or no future-dated match.
 */
function matchReportedStop(
  stops: TripStop[],
  stopId: string | undefined,
  after: number | undefined,
): TripStop | undefined {
  if (stopId == null) return undefined;
  const matches = stops.filter((s) => s.stopId === stopId);
  if (matches.length <= 1) return matches[0];
  if (after != null) {
    const future = matches
      .filter((s) => { const t = stuTime(s); return t == null || t >= after; })
      .sort(bySeq);
    if (future.length > 0) return future[0];
  }
  return [...matches].sort(bySeq)[0];
}

/**
 * Pick a vehicle's NEXT stop from its trip's timetable + reported position.
 * `stopById` is injected so this is pure/testable.
 *
 * stop_id is AUTHORITATIVE across the two realtime feeds. The Passio
 * VehiclePositions and TripUpdates feeds number stop_sequence DIFFERENTLY for
 * the same stop_id (a fixed per-trip offset), and the feed never sets
 * current_status on the wire — so for a moving/approaching bus the reported
 * stopId *is* the stop being approached (GTFS: stop_id with the default
 * IN_TRANSIT_TO status = the next stop). We therefore resolve by stopId and
 * read the ETA from the matching TripUpdates stop, and only use the
 * (internally-consistent) TripUpdates sequence to advance PAST a stop the bus
 * is STOPPED_AT — never trusting the VehiclePositions sequence against
 * TripUpdates. (Verified against the live feed: a sequence-first join showed
 * the wrong next stop on ~half of buses.)
 */
export function resolveNextStop(
  v: Pick<LiveVehicle, "tripId" | "stopId" | "status" | "timestamp">,
  byTrip: Map<string, TripUpdate>,
  stopById: Record<string, StopMeta>,
): NextStop | undefined {
  const tu = v.tripId ? byTrip.get(v.tripId) : undefined;
  const stopped = v.status === "STOPPED_AT";

  // CANCELED and DELETED updates describe trips that will not operate. The
  // VehiclePositions feed can lag the TripUpdates feed, so never decorate a
  // still-published position with a destination from a withdrawn trip.
  if (
    tu?.scheduleRelationship === "CANCELED" ||
    tu?.scheduleRelationship === "DELETED"
  ) {
    return undefined;
  }

  let targetStopId: string | undefined;
  let etaEpoch: number | undefined;

  if (tu && tu.stops.length > 0) {
    const at = matchReportedStop(tu.stops, v.stopId, v.timestamp);
    if (!stopped) {
      // Moving / approaching: the reported stop IS the next stop. Take its ETA
      // from the timetable; if the trip has no STU for it, still name it.
      if (at) {
        const next =
          at.scheduleRelationship === "SKIPPED" &&
          at.stopSequence != null
            ? nextCallableStop(tu.stops, at.stopSequence)
            : at.scheduleRelationship === "SKIPPED"
              ? undefined
              : at;
        targetStopId = next?.stopId;
        etaEpoch = next ? realtimeEta(next) : undefined;
      } else if (v.stopId != null) {
        targetStopId = v.stopId;
      }
    } else if (at?.stopSequence != null) {
      // STOPPED_AT the reported stop: the next stop is the one right after it
      // in the trip's OWN sequence space (consistent within TripUpdates).
      const next = nextCallableStop(tu.stops, at.stopSequence);
      if (next) {
        targetStopId = next.stopId;
        etaEpoch = realtimeEta(next);
      }
    }
  } else if (!stopped && v.stopId != null) {
    // No TripUpdate for this trip: name the approached stop, no ETA.
    targetStopId = v.stopId;
  }

  if (!targetStopId) return undefined;
  const stop = stopById[targetStopId];
  if (!stop) return undefined; // unknown stop -> show nothing, never a guess
  return { id: targetStopId, name: stop.name, lat: stop.lat, lng: stop.lng, etaEpoch };
}

/** Attach a resolved `nextStop` to each vehicle (where resolvable). */
export function decorateVehiclesWithNextStop(
  vehicles: LiveVehicle[],
  updates: TripUpdate[],
  stopById: Record<string, StopMeta> = STOP_BY_ID,
): LiveVehicle[] {
  const byTrip = tripUpdatesByTripId(updates);
  return vehicles.map((v) => {
    const nextStop = resolveNextStop(v, byTrip, stopById);
    return nextStop ? { ...v, nextStop } : v;
  });
}
