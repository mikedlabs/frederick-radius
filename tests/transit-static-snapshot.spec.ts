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
const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(value: string): number {
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const parsed = Date.parse(`${value}T00:00:00Z`);
  expect(Number.isFinite(parsed)).toBe(true);
  return parsed;
}

describe("committed Frederick County TransIT static GTFS snapshot", () => {
  it("contains a complete county network, including the 15 Connector", () => {
    expect(snapshot.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "9349", short: "15", name: "15 Connector" }),
      ]),
    );
    // Guard against an accidentally partial parse without freezing normal
    // upstream additions/removals to one day's exact row counts.
    expect(snapshot.routes.length).toBeGreaterThanOrEqual(15);
    expect(snapshot.stops.length).toBeGreaterThanOrEqual(300);
    expect(new Set(snapshot.routes.map((route) => route.id)).size).toBe(
      snapshot.routes.length,
    );
  });

  it("records static-source freshness separately from realtime data", () => {
    expect(snapshot.staticFeed.sourceUrl).toBe(
      "https://passio3.com/frederick/passioTransit/gtfs/google_transit.zip",
    );
    expect(snapshot.staticFeed.agencyUrl).toContain("frederickcountymd.gov");
    expect(snapshot.staticFeed.scheduleUrl).toContain("frederickcountymd.gov");
    expect(snapshot.staticFeed.fetchedOn).toBe(snapshot.generatedAt);

    const fetched = utcDay(snapshot.staticFeed.fetchedOn);
    const serviceStart = utcDay(snapshot.staticFeed.serviceWindowStart);
    const serviceEnd = utcDay(snapshot.staticFeed.serviceWindowEnd);
    const today = new Date();
    const todayUtc = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    );

    // The Passio feed uses a rolling service window. Assert useful freshness
    // and internal consistency instead of pinning dates that change nightly.
    expect(fetched).toBeLessThanOrEqual(todayUtc + DAY_MS);
    expect(todayUtc - fetched).toBeLessThanOrEqual(14 * DAY_MS);
    expect(serviceStart).toBeLessThanOrEqual(fetched);
    expect(serviceEnd).toBeGreaterThanOrEqual(fetched);
    expect(serviceEnd - serviceStart).toBeGreaterThanOrEqual(7 * DAY_MS);
    expect(serviceEnd - serviceStart).toBeLessThanOrEqual(62 * DAY_MS);
    expect(todayUtc).toBeGreaterThanOrEqual(serviceStart - 2 * DAY_MS);
    expect(todayUtc).toBeLessThanOrEqual(serviceEnd + 2 * DAY_MS);
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
