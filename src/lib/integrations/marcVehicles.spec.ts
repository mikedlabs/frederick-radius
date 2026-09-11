import { afterEach, describe, it, expect, vi } from "vitest";
import { gtfsRealtime } from "./gtfsRealtimeBindings";
import {
  getMarcVehiclesResult,
  inMarcCorridor,
  slimMarcVehicles,
} from "./marcVehicles";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("inMarcCorridor", () => {
  it("keeps the county and the Brunswick Line approaches", () => {
    expect(inMarcCorridor(39.414, -77.411)).toBe(true); // downtown Frederick
    expect(inMarcCorridor(39.314, -77.628)).toBe(true); // Brunswick station
    expect(inMarcCorridor(39.325, -77.732)).toBe(true); // Harpers Ferry, WV
    expect(inMarcCorridor(39.144, -77.267)).toBe(true); // Germantown
  });

  it("drops trains far outside the expanded bbox", () => {
    expect(inMarcCorridor(39.56, -76.06)).toBe(false); // Perryville
    expect(inMarcCorridor(38.35, -77.0)).toBe(false); // south of DC
  });
});

describe("slimMarcVehicles", () => {
  const fix = {
    tripId: "Train871",
    routeId: "11704",
    lat: 39.31417,
    lng: -77.62789,
    bearing: 96.4,
    timestamp: 1_784_400_000,
  };

  it("resolves the line name and rounds the numerics", () => {
    const [v] = slimMarcVehicles([fix]);
    expect(v).toEqual({
      tripId: "Train871",
      line: "Brunswick Line",
      lat: 39.31417,
      lng: -77.62789,
      bearing: 96,
      updatedAt: 1_784_400_000,
    });
  });

  it("falls back to the vehicle id for a Brunswick Line position", () => {
    const [v] = slimMarcVehicles([
      { ...fix, tripId: null, vehicleId: "000085" },
    ]);
    expect(v.tripId).toBe("000085");
    expect(v.line).toBe("Brunswick Line");
  });

  it("drops fixes without identity, coordinates, or a timestamp", () => {
    expect(slimMarcVehicles([{ ...fix, tripId: null, vehicleId: null }])).toEqual([]);
    expect(slimMarcVehicles([{ ...fix, lat: null }])).toEqual([]);
    expect(slimMarcVehicles([{ ...fix, timestamp: null }])).toEqual([]);
  });

  it("drops non-Brunswick trains even when they enter the geographic corridor", () => {
    // Baltimore and Washington both fall inside the deliberately broad
    // corridor box, so location alone cannot identify a Brunswick train.
    expect(
      slimMarcVehicles([{ ...fix, routeId: "11705", lat: 39.2904, lng: -76.6122 }]),
    ).toEqual([]);
    expect(
      slimMarcVehicles([{ ...fix, routeId: "11706", lat: 38.9072, lng: -77.0369 }]),
    ).toEqual([]);
    expect(slimMarcVehicles([{ ...fix, routeId: "99999" }])).toEqual([]);
    expect(slimMarcVehicles([{ ...fix, routeId: null }])).toEqual([]);
  });

  it("still drops Brunswick fixes outside the expanded corridor", () => {
    expect(
      slimMarcVehicles([{ ...fix, lat: 39.56, lng: -76.06 }]),
    ).toEqual([]);
  });
});

describe("MARC vehicle feed metadata", () => {
  it("preserves feed time and excludes a Penn train inside the corridor", async () => {
    const feedTimestamp = 1_785_100_000;
    const bytes = gtfsRealtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0", timestamp: feedTimestamp },
      entity: [
        {
          id: "brunswick",
          vehicle: {
            trip: { tripId: "Train871", routeId: "11704" },
            position: { latitude: 39.31417, longitude: -77.62789 },
            timestamp: feedTimestamp,
          },
        },
        {
          id: "penn",
          vehicle: {
            trip: { tripId: "Train490", routeId: "11705" },
            position: { latitude: 39.2904, longitude: -76.6122 },
            timestamp: feedTimestamp,
          },
        },
      ],
    }).finish();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const body = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(body).set(bytes);
        return new Response(body, { status: 200 });
      }),
    );

    const result = await getMarcVehiclesResult();

    expect(result.status).toBe("ok");
    expect(result.available).toBe(true);
    expect(result.feedTimestamp).toBe(feedTimestamp);
    expect(result.data.map((vehicle) => vehicle.tripId)).toEqual(["Train871"]);
  });

  it("marks an upstream error unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));

    const result = await getMarcVehiclesResult();

    expect(result).toMatchObject({
      data: [],
      status: "unavailable",
      available: false,
    });
    expect(result.feedTimestamp).toBeUndefined();
    expect(result.receivedAt).toBeGreaterThan(0);
  });
});
