/**
 * Next-stop join — the live-bus flight-tracker brain. Asserts the
 * vehicle -> TripUpdate -> next stop resolution against shapes captured from
 * the live Passio feed (trip 714318), and codifies the hard-won rule that the
 * reported stop_id is AUTHORITATIVE: the two feeds number stop_sequence
 * differently for the same stop_id, so a sequence-first join picked the wrong
 * stop on ~half of real buses. Also covers loop routes (repeated stopId
 * disambiguated by the report timestamp) and the honest fallbacks.
 */
import { describe, it, expect } from "vitest";
import {
  resolveNextStop,
  decorateVehiclesWithNextStop,
  tripUpdatesByTripId,
  type StopMeta,
} from "@/lib/integrations/transitNextStop";
import type { LiveVehicle, TripUpdate } from "@/lib/integrations/transitRealtime";

// Static stop table fixture (subset of transit.json, real ids/names).
const STOPS: Record<string, StopMeta> = {
  "162847": { id: "162847", name: "Transit Center - MARC Train Station", lat: 39.4143, lng: -77.4105 },
  "187567": { id: "187567", name: "TC Exit Announcements", lat: 39.4146, lng: -77.4108 },
  "162876": { id: "162876", name: "Square Corner", lat: 39.4151, lng: -77.4106 },
  "162877": { id: "162877", name: "North Market Street at 3rd Street", lat: 39.4178, lng: -77.4103 },
  A: { id: "A", name: "Loop Stop A", lat: 39.41, lng: -77.41 },
  B: { id: "B", name: "Loop Stop B", lat: 39.42, lng: -77.42 },
};

// TripUpdate captured live (trip 714318, first 4 of 26 stop_time_updates).
const TRIP_714318: TripUpdate = {
  tripId: "714318",
  routeId: "6160",
  vehicleId: "16253",
  stops: [
    { stopId: "162847", stopSequence: 1, arrivalEpoch: 1782811881, departureEpoch: 1782814200 },
    { stopId: "187567", stopSequence: 2, arrivalEpoch: 1782814212, departureEpoch: 1782814213 },
    { stopId: "162876", stopSequence: 3, arrivalEpoch: 1782814272, departureEpoch: 1782814273 },
    { stopId: "162877", stopSequence: 4, arrivalEpoch: 1782814293, departureEpoch: 1782814294 },
  ],
};

const byTrip = tripUpdatesByTripId([TRIP_714318]);
const veh = (o: Partial<LiveVehicle>): LiveVehicle => ({ vehicleId: "v", lat: 0, lng: 0, ...o });

describe("resolveNextStop", () => {
  it("resolves the reported stop + its ETA by stopId, IGNORING the VehiclePositions sequence", () => {
    // The bus reports it's approaching 162876 (TripUpdates seq 3) while its
    // VehiclePositions currentStopSequence is a DIFFERENT, offset value (2).
    // The reported stopId must win — a sequence-first join would wrongly pick
    // seq-2's stop (187567). This is the exact live-feed bug guarded here.
    const next = resolveNextStop(
      veh({ tripId: "714318", stopId: "162876", stopSequence: 2, status: "IN_TRANSIT_TO" }),
      byTrip,
      STOPS,
    );
    expect(next?.id).toBe("162876");
    expect(next?.name).toBe("Square Corner");
    expect(next?.etaEpoch).toBe(1782814272);
  });

  it("resolves the approached stop + ETA when current_status is absent (feed default)", () => {
    const next = resolveNextStop(
      veh({ tripId: "714318", stopId: "187567" }),
      byTrip,
      STOPS,
    );
    expect(next).toEqual({
      id: "187567",
      name: "TC Exit Announcements",
      lat: 39.4146,
      lng: -77.4108,
      etaEpoch: 1782814212,
    });
  });

  it("advances to the FOLLOWING stop (by trip sequence) when the bus is STOPPED_AT", () => {
    const next = resolveNextStop(
      veh({ tripId: "714318", stopId: "187567", status: "STOPPED_AT" }),
      byTrip,
      STOPS,
    );
    expect(next?.id).toBe("162876"); // the stop after seq-2 in the trip
    expect(next?.etaEpoch).toBe(1782814272);
  });

  it("on a loop route, picks the UPCOMING occurrence of the reported stopId via the report timestamp", () => {
    const loop: TripUpdate = {
      tripId: "loop", stops: [
        { stopId: "A", stopSequence: 2, arrivalEpoch: 1000 },
        { stopId: "B", stopSequence: 3, arrivalEpoch: 1500 },
        { stopId: "A", stopSequence: 8, arrivalEpoch: 2000 },
      ],
    };
    const next = resolveNextStop(
      veh({ tripId: "loop", stopId: "A", timestamp: 1600, status: "IN_TRANSIT_TO" }),
      tripUpdatesByTripId([loop]),
      STOPS,
    );
    expect(next?.id).toBe("A");
    expect(next?.etaEpoch).toBe(2000); // the future lap, not the passed seq-2 (1000)
  });

  it("on a loop route without a timestamp, falls back to the earliest occurrence", () => {
    const loop: TripUpdate = {
      tripId: "loop", stops: [
        { stopId: "A", stopSequence: 2, arrivalEpoch: 1000 },
        { stopId: "A", stopSequence: 8, arrivalEpoch: 2000 },
      ],
    };
    const next = resolveNextStop(
      veh({ tripId: "loop", stopId: "A" }),
      tripUpdatesByTripId([loop]),
      STOPS,
    );
    expect(next?.etaEpoch).toBe(1000);
  });

  it("falls back to departure time when arrival is missing", () => {
    const next = resolveNextStop(
      veh({ tripId: "714318", stopId: "187567" }),
      tripUpdatesByTripId([{
        ...TRIP_714318,
        stops: [{ stopId: "187567", stopSequence: 2, departureEpoch: 1782814213 }],
      }]),
      STOPS,
    );
    expect(next?.etaEpoch).toBe(1782814213);
  });

  it("names the stop without an ETA when there is no TripUpdate for the trip", () => {
    const next = resolveNextStop(
      veh({ tripId: "999999", stopId: "187567", status: "IN_TRANSIT_TO" }),
      byTrip,
      STOPS,
    );
    expect(next?.id).toBe("187567");
    expect(next?.etaEpoch).toBeUndefined();
  });

  it("returns undefined for an unknown stop id (never guesses)", () => {
    const next = resolveNextStop(
      veh({ tripId: "714318", stopId: "000000" }),
      byTrip,
      STOPS,
    );
    expect(next).toBeUndefined();
  });

  it("returns undefined for a deadheading bus (no trip, no stop)", () => {
    expect(resolveNextStop(veh({}), byTrip, STOPS)).toBeUndefined();
  });

  it("returns undefined when STOPPED_AT the last stop and no following STU exists", () => {
    const next = resolveNextStop(
      veh({ tripId: "714318", stopId: "162877", status: "STOPPED_AT" }),
      byTrip,
      STOPS,
    );
    expect(next).toBeUndefined();
  });
});

describe("decorateVehiclesWithNextStop", () => {
  it("attaches nextStop where resolvable and passes others through unchanged", () => {
    const vehicles: LiveVehicle[] = [
      { vehicleId: "16253", routeId: "6160", tripId: "714318", lat: 39.434, lng: -77.438, stopId: "187567", status: "IN_TRANSIT_TO" },
      { vehicleId: "deadhead", lat: 39.4, lng: -77.4 }, // no trip/stop
    ];
    const out = decorateVehiclesWithNextStop(vehicles, [TRIP_714318], STOPS);
    expect(out[0].nextStop?.name).toBe("TC Exit Announcements");
    expect(out[0].nextStop?.etaEpoch).toBe(1782814212);
    expect(out[1].nextStop).toBeUndefined();
    // Original objects not mutated.
    expect(vehicles[0].nextStop).toBeUndefined();
  });
});
