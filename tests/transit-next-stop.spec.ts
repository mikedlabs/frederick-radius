/**
 * Next-stop join — the live-bus flight-tracker brain. Asserts the
 * vehicle -> TripUpdate -> next stop resolution against the EXACT shapes
 * captured from the live Passio feed (trip 714318), plus the honest
 * fallbacks (unknown stop, deadhead, STOPPED_AT advance, departure fallback).
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

describe("resolveNextStop", () => {
  it("resolves the approached stop + ETA from the live shapes (IN_TRANSIT_TO / no status)", () => {
    const next = resolveNextStop(
      { tripId: "714318", stopId: "187567", stopSequence: 2, status: "IN_TRANSIT_TO" },
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

  it("advances to the FOLLOWING stop when the bus is STOPPED_AT its current one", () => {
    const next = resolveNextStop(
      { tripId: "714318", stopId: "187567", stopSequence: 2, status: "STOPPED_AT" },
      byTrip,
      STOPS,
    );
    expect(next?.id).toBe("162876"); // seq 3, the next one
    expect(next?.etaEpoch).toBe(1782814272);
  });

  it("matches by sequence on loop routes (prefers exact sequence over stopId)", () => {
    // currentStopSequence wins even if a stale stopId points elsewhere.
    const next = resolveNextStop(
      { tripId: "714318", stopId: "162847", stopSequence: 3, status: "IN_TRANSIT_TO" },
      byTrip,
      STOPS,
    );
    expect(next?.id).toBe("162876");
  });

  it("uses the earliest stop at-or-after the target sequence when no exact match", () => {
    const next = resolveNextStop(
      { tripId: "714318", stopSequence: 2 } as LiveVehicle,
      tripUpdatesByTripId([{ ...TRIP_714318, stops: TRIP_714318.stops.filter((s) => s.stopSequence !== 2) }]),
      STOPS,
    );
    expect(next?.id).toBe("162876"); // seq 2 gone -> seq 3 is the next
  });

  it("falls back to departure time when arrival is missing", () => {
    const next = resolveNextStop(
      { tripId: "714318", stopId: "187567", stopSequence: 2 },
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
      { tripId: "999999", stopId: "187567", stopSequence: 2, status: "IN_TRANSIT_TO" },
      byTrip,
      STOPS,
    );
    expect(next?.id).toBe("187567");
    expect(next?.etaEpoch).toBeUndefined();
  });

  it("returns undefined for an unknown stop id (never guesses)", () => {
    const next = resolveNextStop(
      { tripId: "714318", stopId: "000000", stopSequence: 99 },
      byTrip,
      STOPS,
    );
    expect(next).toBeUndefined();
  });

  it("returns undefined for a deadheading bus (no trip, no stop)", () => {
    const next = resolveNextStop({}, byTrip, STOPS);
    expect(next).toBeUndefined();
  });

  it("returns undefined when STOPPED_AT the last stop and no following STU exists", () => {
    const next = resolveNextStop(
      { tripId: "714318", stopId: "162877", stopSequence: 4, status: "STOPPED_AT" },
      byTrip,
      STOPS,
    );
    expect(next).toBeUndefined();
  });
});

describe("decorateVehiclesWithNextStop", () => {
  it("attaches nextStop where resolvable and passes others through unchanged", () => {
    const vehicles: LiveVehicle[] = [
      { vehicleId: "16253", routeId: "6160", tripId: "714318", lat: 39.434, lng: -77.438, stopId: "187567", stopSequence: 2, status: "IN_TRANSIT_TO" },
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
