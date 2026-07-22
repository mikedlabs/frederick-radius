import { describe, expect, it } from "vitest";
import TRANSIT from "@/data/transit.json";
import type { TransitStopPin } from "@/components/map/types";

type TransitSnapshot = {
  generatedAt: string;
  staticFeed: {
    sourceUrl: string;
    agencyUrl: string;
    scheduleUrl: string;
    fetchedOn: string;
    serviceWindowStart: string;
    serviceWindowEnd: string;
  };
  routes: Array<{ id: string; short: string; name: string }>;
  stops: Array<{ id: string | number; name: string; lat: number; lng: number }>;
  shapes: Record<string, number[][]>;
};

const snapshot = TRANSIT as TransitSnapshot;

describe("committed Frederick County TransIT static GTFS snapshot", () => {
  it("contains the July 2026 network, including the new 15 Connector", () => {
    expect(snapshot.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "9349", short: "15", name: "15 Connector" }),
      ]),
    );
    expect(snapshot.routes).toHaveLength(17);
    expect(snapshot.stops).toHaveLength(392);
  });

  it("records static-source freshness separately from realtime data", () => {
    expect(snapshot.staticFeed.sourceUrl).toBe(
      "https://passio3.com/frederick/passioTransit/gtfs/google_transit.zip",
    );
    expect(snapshot.staticFeed.agencyUrl).toContain("frederickcountymd.gov");
    expect(snapshot.staticFeed.scheduleUrl).toContain("frederickcountymd.gov");
    expect(snapshot.staticFeed.fetchedOn).toBe(snapshot.generatedAt);
    expect(snapshot.staticFeed.serviceWindowStart).toBe("2026-07-21");
    expect(snapshot.staticFeed.serviceWindowEnd).toBe("2026-08-21");
  });

  it("retains a unique GTFS stop_id for every map stop", () => {
    const pins: TransitStopPin[] = snapshot.stops.map((stop) => ({
      id: String(stop.id),
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
    }));
    expect(pins.every((pin) => pin.id.length > 0)).toBe(true);
    expect(new Set(pins.map((pin) => pin.id)).size).toBe(pins.length);
  });

  it("has a drawable static shape for every published route", () => {
    for (const route of snapshot.routes) {
      expect(snapshot.shapes[route.id]?.length, route.name).toBeGreaterThanOrEqual(2);
    }
  });
});
