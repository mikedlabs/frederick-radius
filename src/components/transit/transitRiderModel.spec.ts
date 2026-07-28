import { describe, expect, it } from "vitest";
import {
  MAX_SAVED_TRANSIT_BUSES,
  MAX_SAVED_TRANSIT_STOPS,
  deriveCatchability,
  estimateWalkingMinutes,
  isPredictionFresh,
  minutesUntilArrival,
  parseSavedTransitBuses,
  parseSavedTransitStops,
  savedTransitBusMatchesVehicle,
  toggleSavedTransitBus,
  toggleSavedTransitStop,
  type SavedTransitBus,
  type SavedTransitStop,
} from "./transitRiderModel";

function savedStop(index: number): SavedTransitStop {
  return {
    id: String(index),
    name: `Stop ${index}`,
    lat: 39.4 + index / 1000,
    lng: -77.4,
    savedAt: `2026-07-${String(index).padStart(2, "0")}T12:00:00.000Z`,
  };
}

describe("saved transit stops", () => {
  it("parses defensively, removes duplicate ids, and caps the device list", () => {
    const raw = JSON.stringify([
      savedStop(1),
      savedStop(1),
      { ...savedStop(2), lat: 120 },
      ...Array.from({ length: 7 }, (_, index) => savedStop(index + 3)),
    ]);

    const parsed = parseSavedTransitStops(raw);

    expect(parsed).toHaveLength(MAX_SAVED_TRANSIT_STOPS);
    expect(parsed.map((stop) => stop.id)).toEqual(["1", "3", "4", "5", "6", "7"]);
    expect(parseSavedTransitStops("{bad json")).toEqual([]);
  });

  it("adds and removes a stop without silently evicting another one", () => {
    const first = savedStop(1);
    const added = toggleSavedTransitStop(
      [],
      first,
      "2026-07-28T12:00:00.000Z",
    );
    expect(added.saved).toBe(true);
    expect(added.stops).toHaveLength(1);

    const removed = toggleSavedTransitStop(
      added.stops,
      first,
      "2026-07-28T12:01:00.000Z",
    );
    expect(removed).toMatchObject({
      stops: [],
      saved: false,
      limitReached: false,
    });

    const full = Array.from(
      { length: MAX_SAVED_TRANSIT_STOPS },
      (_, index) => savedStop(index + 1),
    );
    const blocked = toggleSavedTransitStop(
      full,
      savedStop(20),
      "2026-07-28T12:02:00.000Z",
    );
    expect(blocked.limitReached).toBe(true);
    expect(blocked.stops.map((stop) => stop.id)).toEqual(
      full.map((stop) => stop.id),
    );
  });

  it("prunes removed stop ids before the cap and refreshes current details", () => {
    const current = {
      ...savedStop(20),
      name: "Current stop name",
      lat: 39.5,
      lng: -77.5,
    };
    const raw = JSON.stringify([
      ...Array.from({ length: 6 }, (_, index) => savedStop(index + 1)),
      savedStop(20),
    ]);

    expect(parseSavedTransitStops(raw, [current])).toEqual([current]);
  });
});

function savedBus(index: number): SavedTransitBus {
  return {
    watchId: `bus-${index}:trip-${index}`,
    vehicleId: `bus-${index}`,
    tripId: `trip-${index}`,
    routeId: `route-${index}`,
    routeShort: String(index),
    routeName: `Route ${index}`,
    headsign: `Destination ${index}`,
    targetStop: savedStop(index),
    lastSeenAt: 1_785_000_000 + index,
    savedAt: `2026-07-${String(index).padStart(2, "0")}T12:00:00.000Z`,
  };
}

describe("saved transit buses", () => {
  it("parses exact runs defensively, deduplicates, caps, and strips coordinates", () => {
    const first = { ...savedBus(1), lat: 39.4, lng: -77.4 };
    const raw = JSON.stringify([
      first,
      first,
      { ...savedBus(2), targetStop: { ...savedStop(2), lat: 120 } },
      ...Array.from({ length: 7 }, (_, index) => savedBus(index + 3)),
    ]);

    const parsed = parseSavedTransitBuses(raw);

    expect(parsed).toHaveLength(MAX_SAVED_TRANSIT_BUSES);
    expect(parsed[0]).not.toHaveProperty("lat");
    expect(parsed[0]).not.toHaveProperty("lng");
    expect(parsed.map((bus) => bus.watchId)).toEqual([
      "bus-1:trip-1",
      "bus-3:trip-3",
      "bus-4:trip-4",
      "bus-5:trip-5",
      "bus-6:trip-6",
      "bus-7:trip-7",
    ]);
    expect(parseSavedTransitBuses("{bad json")).toEqual([]);
  });

  it("canonicalizes selectable target stops and drops obsolete stop context", () => {
    const current = {
      id: "current-stop",
      name: "Current stop name",
      lat: 39.5,
      lng: -77.5,
    };
    const withCurrent = {
      ...savedBus(1),
      targetStop: { ...current, name: "Old name", lat: 39.4 },
    };
    const withObsolete = {
      ...savedBus(2),
      targetStop: savedStop(99),
    };

    const parsed = parseSavedTransitBuses(
      JSON.stringify([withCurrent, withObsolete]),
      [current],
    );

    expect(parsed[0]?.targetStop).toEqual(current);
    expect(parsed[1]?.targetStop).toBeUndefined();
  });

  it("saves separate runs without silently evicting another bus", () => {
    const first = savedBus(1);
    const added = toggleSavedTransitBus(
      [],
      first,
      "2026-07-28T12:00:00.000Z",
    );
    expect(added.saved).toBe(true);
    expect(added.buses).toHaveLength(1);

    const nextRun = toggleSavedTransitBus(
      added.buses,
      { ...first, tripId: "trip-next" },
      "2026-07-28T13:00:00.000Z",
    );
    expect(nextRun.saved).toBe(true);
    expect(nextRun.buses.map((bus) => bus.watchId)).toEqual([
      "bus-1:trip-next",
      "bus-1:trip-1",
    ]);

    const removed = toggleSavedTransitBus(
      nextRun.buses,
      first,
      "2026-07-28T14:00:00.000Z",
    );
    expect(removed.buses.map((bus) => bus.watchId)).toEqual([
      "bus-1:trip-next",
    ]);

    const full = Array.from(
      { length: MAX_SAVED_TRANSIT_BUSES },
      (_, index) => savedBus(index + 1),
    );
    const blocked = toggleSavedTransitBus(
      full,
      savedBus(20),
      "2026-07-28T15:00:00.000Z",
    );
    expect(blocked.limitReached).toBe(true);
    expect(blocked.buses).toEqual(full);
  });

  it("does not treat a reused vehicle on another trip or route as live", () => {
    const saved = savedBus(1);
    expect(savedTransitBusMatchesVehicle(saved, saved)).toBe(true);
    expect(
      savedTransitBusMatchesVehicle(saved, {
        ...saved,
        vehicleId: "replacement-bus",
      }),
    ).toBe(true);
    expect(
      savedTransitBusMatchesVehicle(
        { ...saved, tripId: undefined, watchId: saved.vehicleId },
        saved,
      ),
    ).toBe(false);
    expect(
      savedTransitBusMatchesVehicle(saved, {
        vehicleId: saved.vehicleId,
        tripId: "different-trip",
        routeId: saved.routeId,
      }),
    ).toBe(false);
    expect(
      savedTransitBusMatchesVehicle(saved, {
        vehicleId: saved.vehicleId,
        tripId: saved.tripId,
        routeId: "different-route",
      }),
    ).toBe(false);
  });
});

describe("rider timing estimates", () => {
  it("inflates straight-line distance before estimating the walk", () => {
    expect(estimateWalkingMinutes(1000)).toBe(18);
    expect(estimateWalkingMinutes(-1)).toBeNull();
  });

  it("rounds arrival minutes down so the advice errs early", () => {
    const nowMs = 1_000_000;
    const arrivalEpoch = nowMs / 1000 + 5 * 60 + 59;
    expect(minutesUntilArrival(arrivalEpoch, nowMs)).toBe(5);
    expect(minutesUntilArrival(undefined, nowMs)).toBeNull();
  });

  it("uses a prediction timestamp when present and the feed age otherwise", () => {
    const nowMs = 1_700_000_000_000;
    expect(isPredictionFresh(undefined, nowMs, true)).toBe(true);
    expect(isPredictionFresh(undefined, nowMs, false)).toBe(false);
    expect(
      isPredictionFresh((nowMs - 89_000) / 1000, nowMs, true),
    ).toBe(true);
    expect(
      isPredictionFresh((nowMs - 91_000) / 1000, nowMs, true),
    ).toBe(false);
    expect(isPredictionFresh(nowMs - 10_000, nowMs, true)).toBe(true);
    expect(
      isPredictionFresh((nowMs + 5 * 60_000) / 1000, nowMs, true),
    ).toBe(false);
  });

  it("only labels fresh arrivals with conservative catchability language", () => {
    expect(deriveCatchability(12, 8, false)).toBeNull();
    expect(deriveCatchability(12, null, true)).toBeNull();
    expect(deriveCatchability(7, 8, true)).toEqual({
      kind: "too-tight",
      label: "Probably too tight",
    });
    expect(deriveCatchability(8, 8, true)).toEqual({
      kind: "tight",
      label: "Leave now. Timing is tight.",
    });
    expect(deriveCatchability(10, 8, true)).toEqual({
      kind: "likely",
      label: "Likely catchable",
    });
  });
});
