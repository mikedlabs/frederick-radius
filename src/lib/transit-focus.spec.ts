import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findCurrentTransitVehicle,
  requestTransitRouteFocus,
  requestTransitVehicleFocus,
  takePendingTransitRouteFocus,
  takePendingTransitVehicleFocus,
  TRANSIT_ROUTE_FOCUS_EVENT,
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
        lat: 39.421,
        lng: -77.413,
        timestamp: (nowMs - 20_000) / 1000,
      },
      {
        vehicleId: "bus-old",
        routeId: "9349",
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
