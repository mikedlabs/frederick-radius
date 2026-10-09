import { describe, expect, it } from "vitest";
import { townEventsFrom, type EventWithMeta } from "./events";

const NOW = new Date("2026-10-07T16:00:00.000Z");

function event(
  slug: string,
  municipality: string,
  startsAt: string,
  geom: { lng: number; lat: number },
  overrides: Partial<EventWithMeta> = {},
): EventWithMeta {
  return {
    slug,
    title: slug,
    description: "",
    starts_at: startsAt,
    ends_at: null,
    timezone: "America/New_York",
    venue_name: "Town hall",
    address: "",
    geom,
    municipality,
    category: "community",
    audience: [],
    is_free: true,
    source: "manual",
    is_verified: true,
    geo_confidence: "exact_address",
    category_name: "Community",
    municipality_name: municipality,
    ...overrides,
  } as unknown as EventWithMeta;
}

// Real centroids from src/data/municipalities.ts: Rosemont sits about 2 km
// from Brunswick, Burkittsville about 9 km, Frederick about 22 km.
const BRUNSWICK = { lng: -77.628, lat: 39.3134 };
const ROSEMONT = { lng: -77.6242, lat: 39.3317 };
const BURKITTSVILLE = { lng: -77.6253, lat: 39.394 };
const FREDERICK = { lng: -77.4105, lat: 39.4143 };

const POOL = [
  event("brunswick-later", "brunswick", "2026-10-10T14:00:00.000Z", BRUNSWICK),
  event("brunswick-past", "brunswick", "2026-10-01T14:00:00.000Z", BRUNSWICK),
  event("brunswick-soon", "brunswick", "2026-10-08T22:00:00.000Z", BRUNSWICK),
  event("burkittsville-fair", "burkittsville", "2026-10-09T14:00:00.000Z", BURKITTSVILLE),
  event("rosemont-supper", "rosemont", "2026-10-11T22:00:00.000Z", ROSEMONT),
  event("frederick-show", "frederick", "2026-10-08T23:00:00.000Z", FREDERICK),
  event("rosemont-webinar", "rosemont", "2026-10-08T23:00:00.000Z", ROSEMONT, {
    geo_confidence: "unknown",
  }),
];

describe("townEventsFrom", () => {
  it("scopes the shared event set to the town, soonest first, without past events", () => {
    const { events } = townEventsFrom(POOL, "brunswick", NOW);

    // The town page used to read the curated seeds only and said "Nothing is
    // listed for Brunswick yet" while /towns and /events listed Brunswick
    // events. Every listed event in the shared set must reach the page.
    expect(events.map((e) => e.slug)).toEqual(["brunswick-soon", "brunswick-later"]);
  });

  it("offers nearby towns' events by distance, only where a location is known", () => {
    const { nearby } = townEventsFrom(POOL, "brunswick", NOW);

    expect(nearby.map((e) => e.slug)).toEqual([
      "rosemont-supper",
      "burkittsville-fair",
    ]);
  });

  it("returns nothing for an unknown town", () => {
    expect(townEventsFrom(POOL, "atlantis", NOW)).toEqual({ events: [], nearby: [] });
  });
});
