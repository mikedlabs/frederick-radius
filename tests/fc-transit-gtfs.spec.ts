import { describe, it, expect } from "vitest";
import { transform } from "../transforms/fc_transit_gtfs";
import type { FcTransitGtfsRaw } from "../pipeline/schemas_ts/fc_transit_gtfs";

// Fixture shaped like parsed GTFS rows. Test values, not the real feed.
const raw = {
  routes: [
    { route_id: "10", route_short_name: "10", route_long_name: "Golden Mile", route_type: 3, route_color: "1A7F3C" },
    { route_id: "X", route_short_name: "X", route_long_name: "Shuttle", route_type: 4 }, // ferry, dropped
  ],
  stops: [
    { stop_id: "s1", stop_name: "Frederick TransIT Center", stop_lat: "39.4143", stop_lon: "-77.4105" },
    { stop_id: "s2", stop_name: "Bad coords", stop_lat: "0", stop_lon: "0" }, // dropped
    { stop_id: "s3", stop_name: "Out of county", stop_lat: 38.9, stop_lon: -77.04 }, // DC, dropped
  ],
} as unknown as FcTransitGtfsRaw;

describe("transform(fc_transit_gtfs)", () => {
  it("keeps only bus routes and normalizes the hex color", () => {
    const d = transform(raw).data as {
      route_count: number;
      routes: { id: string; color: string | null }[];
    };
    expect(d.route_count).toBe(1);
    expect(d.routes[0]).toMatchObject({ id: "10", color: "#1A7F3C" });
  });

  it("drops stops with missing or out-of-county coordinates", () => {
    const d = transform(raw).data as {
      stop_count: number;
      stops: { id: string; lat: number; lng: number }[];
    };
    expect(d.stop_count).toBe(1);
    expect(d.stops[0]).toMatchObject({ id: "s1", lat: 39.4143, lng: -77.4105 });
  });

  it("defaults a missing route color to null, never a guess", () => {
    const out = transform({
      routes: [{ route_id: "55", route_type: 3 }],
      stops: [],
    } as unknown as FcTransitGtfsRaw);
    const d = out.data as { routes: { color: string | null }[] };
    expect(d.routes[0].color).toBeNull();
  });
});
