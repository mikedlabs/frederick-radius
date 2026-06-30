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

/** Pick a vehicle's NEXT stop from its trip's timetable + reported position.
 *  `stopById` is injected so this is pure/testable. */
export function resolveNextStop(
  v: Pick<LiveVehicle, "tripId" | "stopId" | "stopSequence" | "status">,
  byTrip: Map<string, TripUpdate>,
  stopById: Record<string, StopMeta>,
): NextStop | undefined {
  const tu = v.tripId ? byTrip.get(v.tripId) : undefined;

  // If the bus is STOPPED_AT its current stop, the NEXT stop is the one after
  // it in the sequence — and we can only name it from the trip timetable, so
  // the seed stopId starts undefined (no honest guess without the trip).
  const stopped = v.status === "STOPPED_AT";
  const targetSeq =
    v.stopSequence != null ? v.stopSequence + (stopped ? 1 : 0) : undefined;
  let targetStopId: string | undefined = stopped ? undefined : v.stopId;
  let etaEpoch: number | undefined;

  if (tu && tu.stops.length > 0) {
    let stu: TripStop | undefined;
    if (targetSeq != null) {
      // Prefer an exact sequence match (handles loop routes where a stopId
      // repeats); else the earliest stop at-or-after the target sequence.
      stu =
        tu.stops.find((s) => s.stopSequence === targetSeq) ??
        tu.stops
          .filter((s) => s.stopSequence != null && s.stopSequence >= targetSeq)
          .sort((a, b) => (a.stopSequence! - b.stopSequence!))[0];
    }
    // Not stopped + no sequence match: fall back to the reported stopId.
    if (!stu && !stopped && v.stopId != null) {
      stu = tu.stops.find((s) => s.stopId === v.stopId);
    }
    if (stu) {
      targetStopId = stu.stopId ?? targetStopId;
      etaEpoch = stu.arrivalEpoch ?? stu.departureEpoch;
    }
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
