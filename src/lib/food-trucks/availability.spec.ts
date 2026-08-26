import { describe, expect, it } from "vitest";
import type { TruckBeacon } from "./beacon";
import type { FoodTruckScheduleSnapshot } from "./schedule-types";
import { buildFoodTruckAvailability } from "./availability";

const NOW = new Date("2026-08-22T18:00:00.000Z");

function schedule(
  overrides: Partial<FoodTruckScheduleSnapshot> = {},
): FoodTruckScheduleSnapshot {
  return {
    version: 1,
    generatedAt: "2026-08-22T16:00:00.000Z",
    windowStart: "2026-08-22T04:00:00.000Z",
    windowEnd: "2026-08-30T04:00:00.000Z",
    sources: [{
      id: "venue",
      label: "Test Venue",
      ok: true,
      count: 1,
      checkedAt: "2026-08-22T16:00:00.000Z",
    }],
    stops: [{
      id: "stop-1",
      title: "In10se BBQ at Test Venue",
      startsAt: "2026-08-22T19:00:00.000Z",
      endsAt: "2026-08-22T23:00:00.000Z",
      venueName: "Test Venue",
      municipality: "Frederick",
      lat: 39.414,
      lng: -77.41,
      vendors: [{ name: "In10se BBQ", slug: "in10se-bbq" }],
      sourceName: "Test Venue",
      sourceUrl: "https://example.com/food-trucks",
      confidence: "venue",
    }],
    ...overrides,
  };
}

const beacon: TruckBeacon = {
  truckSlug: "in10se-bbq",
  lat: 39.416,
  lng: -77.412,
  spot: "Baker Park",
  note: "Brisket until sold out",
  startedAt: "2026-08-22T17:00:00.000Z",
  expiresAt: "2026-08-22T21:00:00.000Z",
};

describe("shared food-truck availability", () => {
  it("keeps operator presence distinct from a publisher's scheduled stop", () => {
    const result = buildFoodTruckAvailability({
      beacons: new Map([[beacon.truckSlug, beacon]]),
      schedule: schedule(),
      now: NOW,
    });

    expect(result.scheduleState).toBe("current");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      kind: "operator-live",
      truckSlug: "in10se-bbq",
      spot: "Baker Park",
      municipality: "Frederick City",
      sourceConfidence: "operator",
    });
    expect(result.items[1]).toMatchObject({
      kind: "published-stop",
      venueName: "Test Venue",
      sourceConfidence: "venue",
    });
  });

  it("does not publish stops from a source that failed its latest refresh", () => {
    const failed = schedule({
      sources: [{
        id: "venue",
        label: "Test Venue",
        ok: false,
        count: 0,
        checkedAt: "2026-08-22T16:00:00.000Z",
        error: "timeout",
      }],
    });

    const result = buildFoodTruckAvailability({
      beacons: new Map(),
      schedule: failed,
      now: NOW,
    });
    expect(result.scheduleState).toBe("unavailable");
    expect(result.items).toEqual([]);
  });

  it("marks a mixed publisher refresh partial and keeps only healthy-source stops", () => {
    const partial = schedule({
      sources: [
        ...schedule().sources,
        {
          id: "failed-venue",
          label: "Failed Venue",
          ok: false,
          count: 0,
          checkedAt: "2026-08-22T16:00:00.000Z",
          error: "timeout",
        },
      ],
      stops: [
        ...schedule().stops,
        {
          ...schedule().stops[0],
          id: "failed-stop",
          sourceName: "Failed Venue",
        },
      ],
    });

    const result = buildFoodTruckAvailability({
      beacons: new Map(),
      schedule: partial,
      now: NOW,
    });

    expect(result.scheduleState).toBe("partial");
    expect(result.items.map((item) => item.id)).toEqual([
      "schedule:stop-1:in10se-bbq",
    ]);
  });

  it("treats a snapshot without source health as unavailable", () => {
    const result = buildFoodTruckAvailability({
      beacons: new Map(),
      schedule: schedule({ sources: [] }),
      now: NOW,
    });

    expect(result.scheduleState).toBe("unavailable");
    expect(result.items).toEqual([]);
  });

  it("drops expired beacons and out-of-county coordinates", () => {
    const expired = { ...beacon, expiresAt: "2026-08-22T17:30:00.000Z" };
    const outside = {
      ...beacon,
      truckSlug: "grilled-cheese-please",
      lat: 38.9,
      lng: -77.0,
    };

    const result = buildFoodTruckAvailability({
      beacons: new Map([
        [expired.truckSlug, expired],
        [outside.truckSlug, outside],
      ]),
      schedule: null,
      now: NOW,
    });
    expect(result.scheduleState).toBe("unavailable");
    expect(result.items).toEqual([]);
  });

  it("keeps a stop without an end time only until its published start", () => {
    const future = schedule({
      stops: [{
        ...schedule().stops[0],
        startsAt: "2026-08-22T19:00:00.000Z",
        endsAt: undefined,
      }],
    });
    const started = schedule({
      stops: [{
        ...future.stops[0],
        startsAt: "2026-08-22T17:00:00.000Z",
      }],
    });

    expect(buildFoodTruckAvailability({
      beacons: new Map(),
      schedule: future,
      now: NOW,
    }).items).toHaveLength(1);
    expect(buildFoodTruckAvailability({
      beacons: new Map(),
      schedule: started,
      now: NOW,
    }).items).toEqual([]);
  });

  it("lets a confirmed live pin replace only an overlapping scheduled-now record", () => {
    const currentAndFuture = schedule({
      stops: [
        {
          ...schedule().stops[0],
          id: "current",
          startsAt: "2026-08-22T17:00:00.000Z",
          endsAt: "2026-08-22T20:00:00.000Z",
        },
        {
          ...schedule().stops[0],
          id: "later",
          startsAt: "2026-08-23T17:00:00.000Z",
          endsAt: "2026-08-23T20:00:00.000Z",
        },
      ],
    });

    const result = buildFoodTruckAvailability({
      beacons: new Map([[beacon.truckSlug, beacon]]),
      schedule: currentAndFuture,
      now: NOW,
    });
    expect(result.items.map((item) => item.id)).toEqual([
      "beacon:in10se-bbq",
      "schedule:later:in10se-bbq",
    ]);
  });
});
