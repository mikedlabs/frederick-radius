import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findCurrentTransitVehicle,
  peekPendingTransitFocus,
  clearPendingTransitRouteFocus,
  clearPendingTransitStopFocus,
  clearPendingTransitVehicleFocus,
  requestTransitRouteFocus,
  requestTransitStopFocus,
  isTransitStopFocusDetail,
  requestTransitVehicleFocus,
  takePendingTransitRouteFocus,
  takePendingTransitStopFocus,
  takePendingTransitVehicleFocus,
  TRANSIT_ROUTE_FOCUS_EVENT,
  TRANSIT_STOP_FOCUS_EVENT,
  TRANSIT_VEHICLE_FOCUS_EVENT,
} from "./transit-focus";

describe("transit route focus handoff", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retains a route selected before the map chunk is ready", () => {
    const values = new Map<string, string>();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      dispatchEvent,
    });
    vi.stubGlobal("CustomEvent", class {
      type: string;
      detail: unknown;
      constructor(type: string, init: { detail: unknown }) {
        this.type = type;
        this.detail = init.detail;
      }
    });

    requestTransitRouteFocus("6154");

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: TRANSIT_ROUTE_FOCUS_EVENT,
      detail: { routeId: "6154" },
    });
    expect(takePendingTransitRouteFocus()).toBe("6154");
    expect(takePendingTransitRouteFocus()).toBeNull();
  });

  it("dispatches and retains a typed vehicle plus stop focus request", () => {
    const values = new Map<string, string>();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      dispatchEvent,
    });
    vi.stubGlobal("CustomEvent", class {
      type: string;
      detail: unknown;
      constructor(type: string, init: { detail: unknown }) {
        this.type = type;
        this.detail = init.detail;
      }
    });
    const detail = {
      vehicleId: "bus-15",
      routeId: "9349",
      bus: { lat: 39.421, lng: -77.413 },
      stop: { lat: 39.424, lng: -77.41 },
      stopId: "162950",
      stopName: "Transit Center",
    };

    expect(requestTransitVehicleFocus(detail)).toBe(true);

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: TRANSIT_VEHICLE_FOCUS_EVENT,
      detail,
    });
    expect(takePendingTransitVehicleFocus()).toEqual(detail);
    expect(takePendingTransitVehicleFocus()).toBeNull();
  });

  it("resolves only the exact current vehicle with a usable position", () => {
    const nowMs = 1_700_000_000_000;
    const vehicles = [
      {
        vehicleId: "bus-15",
        routeId: "9349",
        tripId: "trip-15",
        lat: 39.421,
        lng: -77.413,
        timestamp: (nowMs - 20_000) / 1000,
      },
      {
        vehicleId: "bus-old",
        routeId: "9349",
        tripId: "trip-old",
        lat: 39.42,
        lng: -77.41,
        timestamp: (nowMs - 41_000) / 1000,
      },
    ];

    expect(
      findCurrentTransitVehicle({
        vehicles,
        vehicleId: "bus-15",
        expectedRouteId: "9349",
        expectedTripId: "trip-15",
        feedCurrent: true,
        nowMs,
      }),
    ).toEqual(vehicles[0]);
    expect(
      findCurrentTransitVehicle({
        vehicles,
        vehicleId: "bus-old",
        feedCurrent: true,
        nowMs,
      }),
    ).toBeNull();
    expect(
      findCurrentTransitVehicle({
        vehicles,
        vehicleId: "bus-15",
        expectedTripId: "different-trip",
        feedCurrent: true,
        nowMs,
      }),
    ).toBeNull();
    expect(
      findCurrentTransitVehicle({
        vehicles,
        vehicleId: "bus-15",
        expectedRouteId: "6154",
        feedCurrent: true,
        nowMs,
      }),
    ).toBeNull();
    expect(
      findCurrentTransitVehicle({
        vehicles,
        vehicleId: "bus-15",
        feedCurrent: false,
        nowMs,
      }),
    ).toBeNull();
  });
});


describe("typed stop focus and latest rider intent", () => {
  let values: Map<string, string>;
  const dispatchEvent = vi.fn();
  const stop = { stopId: "162950" };
  const vehicle = {
    vehicleId: "declared-fixture-bus", routeId: "6154",
    bus: { lat: 39.4258, lng: -77.4094 },
    stop: { lat: 39.42717, lng: -77.40899 },
    stopId: "162950", stopName: "10th Street at Motter Avenue",
  };
  // Static stop and route identities match the checked-in GTFS catalog.
  // The bus id and position are test fixtures, never a current service claim.
  beforeEach(() => {
    values = new Map();
    dispatchEvent.mockReset();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      }, dispatchEvent,
    });
    vi.stubGlobal("CustomEvent", class {
      constructor(public type: string, public init: { detail: unknown }) {}
      get detail() { return this.init.detail; }
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([undefined, false, true])("retains a typed stop request before deferred map hydration (%s)", (selectForRider) => {
    const detail = selectForRider === undefined ? stop : { ...stop, selectForRider };
    expect(requestTransitStopFocus(detail)).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({ type: TRANSIT_STOP_FOCUS_EVENT, detail });
    expect(takePendingTransitStopFocus()).toEqual(detail);
    expect(takePendingTransitStopFocus()).toBeNull();
  });

  it("keeps only the latest stop when several are chosen before the map is ready", () => {
    requestTransitStopFocus(stop);
    requestTransitStopFocus({ stopId: "162951", selectForRider: true });
    expect(takePendingTransitStopFocus()).toEqual({ stopId: "162951", selectForRider: true });
    expect(takePendingTransitStopFocus()).toBeNull();
  });

  const pairs = [
    ["route", "stop"], ["vehicle", "stop"],
    ["stop", "route"], ["vehicle", "route"],
    ["stop", "vehicle"], ["route", "vehicle"],
  ] as const;
  it.each(pairs)("gives the latest %s → %s request sole pending ownership", (first, last) => {
    const request = {
      route: () => requestTransitRouteFocus("6154"),
      vehicle: () => requestTransitVehicleFocus(vehicle),
      stop: () => requestTransitStopFocus(stop),
    };
    request[first]();
    request[last]();
    expect(takePendingTransitRouteFocus()).toEqual(last === "route" ? "6154" : null);
    expect(takePendingTransitVehicleFocus()).toEqual(last === "vehicle" ? vehicle : null);
    expect(takePendingTransitStopFocus()).toEqual(last === "stop" ? stop : null);
  });

  it.each([null, {}, { stopId: "" }, { stopId: "   " }, { stopId: 162950 }, { stopId: "162950", selectForRider: "true" }])("rejects malformed stop intent without erasing an existing vehicle request: %j", (invalid) => {
    requestTransitVehicleFocus(vehicle);
    dispatchEvent.mockClear();
    expect(isTransitStopFocusDetail(invalid)).toBe(false);
    expect(requestTransitStopFocus(invalid as Parameters<typeof requestTransitStopFocus>[0])).toBe(false);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(takePendingTransitVehicleFocus()).toEqual(vehicle);
    expect(takePendingTransitStopFocus()).toBeNull();
  });

  it("preserves a valid route when a malformed stop intent is refused", () => {
    requestTransitRouteFocus("6154");
    expect(requestTransitStopFocus({ stopId: "" })).toBe(false);
    expect(takePendingTransitRouteFocus()).toBe("6154");
  });

  it("retains the valid handoff when session storage is blocked", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => { throw new DOMException("Blocked", "SecurityError"); },
        setItem: () => { throw new DOMException("Blocked", "SecurityError"); },
        removeItem: () => { throw new DOMException("Blocked", "SecurityError"); },
      }, dispatchEvent,
    });
    expect(requestTransitStopFocus(stop)).toBe(true);
    expect(dispatchEvent.mock.calls.at(-1)?.[0]).toMatchObject({ type: TRANSIT_STOP_FOCUS_EVENT, detail: stop });
    expect(takePendingTransitStopFocus()).toEqual(stop);
    expect(takePendingTransitStopFocus()).toBeNull();
  });

  it.each(["{broken", "null", '{"stopId": 162950}', '{"stopId":"162950","selectForRider":"yes"}'])("consumes corrupt retained stop data once without replaying it: %s", (raw) => {
    values.set("fr:transit-stop-focus:v1", raw);
    expect(takePendingTransitStopFocus()).toBeNull();
    expect(values.has("fr:transit-stop-focus:v1")).toBe(false);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});


describe("in-memory deferred focus ownership", () => {
  const vehicle = { vehicleId: "declared-bus", routeId: "6154", bus: { lng: -77.41, lat: 39.42 }, stop: { lng: -77.42, lat: 39.43 }, stopId: "162950" };
  const stop = { stopId: "162950" };
  const requests = { route: () => requestTransitRouteFocus("6154"), stop: () => requestTransitStopFocus(stop), vehicle: () => requestTransitVehicleFocus(vehicle) };
  const take = { route: takePendingTransitRouteFocus, stop: takePendingTransitStopFocus, vehicle: takePendingTransitVehicleFocus };
  let stored: Map<string, string>;
  const dispatchEvent = vi.fn();
  beforeEach(() => {
    stored = new Map();
    dispatchEvent.mockReset();
    vi.stubGlobal("CustomEvent", class { constructor(public type: string, public init: { detail: unknown }) {} get detail() { return this.init.detail; } });
    vi.stubGlobal("window", { sessionStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: () => { throw new Error("Storage blocked"); },
      removeItem: () => { throw new Error("Storage blocked"); },
    }, dispatchEvent });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["route", "stop", "vehicle"] as const)("peeks then consumes %s once with blocked storage", (kind) => {
    requests[kind]();
    expect(peekPendingTransitFocus()?.kind).toBe(kind);
    expect(peekPendingTransitFocus()?.kind).toBe(kind);
    expect(take[kind]()).not.toBeNull();
    expect(take[kind]()).toBeNull();
    expect(peekPendingTransitFocus()).toBeNull();
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });

  it.each([["route", "stop"], ["vehicle", "stop"], ["stop", "route"], ["vehicle", "route"], ["stop", "vehicle"], ["route", "vehicle"]] as const)("keeps only %s → %s during a blocked-storage chunk gap", (first, last) => {
    requests[first](); requests[last]();
    expect(peekPendingTransitFocus()?.kind).toBe(last);
    expect(take[first]()).toBeNull();
    expect(take[last]()).not.toBeNull();
    expect(peekPendingTransitFocus()).toBeNull();
  });

  it("never resurrects an older vehicle when storage removal fails", () => {
    stored.set("fr:transit-vehicle-focus:v1", JSON.stringify(vehicle));
    requestTransitStopFocus(stop);
    expect(takePendingTransitVehicleFocus()).toBeNull();
    expect(takePendingTransitStopFocus()).toEqual(stop);
    expect(peekPendingTransitFocus()).toBeNull();
    expect(takePendingTransitVehicleFocus()).toBeNull();
    expect(stored.has("fr:transit-vehicle-focus:v1")).toBe(true);
  });

  it("copies coordinates and strips caller extras before retaining a vehicle", () => {
    const mutable = { ...vehicle, bus: { ...vehicle.bus }, stop: { ...vehicle.stop }, extra: "untrusted" };
    requestTransitVehicleFocus(mutable);
    mutable.bus.lat = 0; mutable.stop.lng = 0;
    const peek = peekPendingTransitFocus();
    expect(peek).toEqual({ kind: "vehicle", detail: vehicle });
    if (peek?.kind === "vehicle") peek.detail.bus.lng = 0;
    expect(takePendingTransitVehicleFocus()).toEqual(vehicle);
  });

  it.each(["route", "stop", "vehicle"] as const)("clears an in-memory %s without depending on device storage", (kind) => {
    requests[kind]();
    ({ route: clearPendingTransitRouteFocus, stop: clearPendingTransitStopFocus, vehicle: clearPendingTransitVehicleFocus })[kind]();
    expect(peekPendingTransitFocus()).toBeNull();
  });

  it("reads a hard-navigation session request without consuming it during launcher activation", () => {
    stored.set("fr:transit-stop-focus:v1", JSON.stringify(stop));
    expect(peekPendingTransitFocus()).toEqual({ kind: "stop", detail: stop });
    expect(peekPendingTransitFocus()).toEqual({ kind: "stop", detail: stop });
    expect(takePendingTransitStopFocus()).toEqual(stop);
    expect(peekPendingTransitFocus()).toBeNull();
  });
});
