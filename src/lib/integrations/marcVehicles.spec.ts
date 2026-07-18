import { describe, it, expect } from "vitest";
import { inMarcCorridor, slimMarcVehicles } from "./marcVehicles";

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

  it("labels unknown routes plainly as MARC and falls back to the vehicle id", () => {
    const [v] = slimMarcVehicles([
      { ...fix, tripId: null, vehicleId: "000085", routeId: "99999" },
    ]);
    expect(v.tripId).toBe("000085");
    expect(v.line).toBe("MARC");
  });

  it("drops fixes without identity, coordinates, or a timestamp", () => {
    expect(slimMarcVehicles([{ ...fix, tripId: null, vehicleId: null }])).toEqual([]);
    expect(slimMarcVehicles([{ ...fix, lat: null }])).toEqual([]);
    expect(slimMarcVehicles([{ ...fix, timestamp: null }])).toEqual([]);
  });

  it("drops fixes outside the corridor (a Penn train at Perryville)", () => {
    expect(
      slimMarcVehicles([{ ...fix, routeId: "11705", lat: 39.56, lng: -76.06 }]),
    ).toEqual([]);
  });
});
