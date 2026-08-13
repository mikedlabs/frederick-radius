import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@/data/events";

const mocks = vi.hoisted(() => ({
  assembleUnifiedEvents: vi.fn(),
}));

vi.mock("@/lib/loaders/unifiedEvents", () => ({
  assembleUnifiedEvents: mocks.assembleUnifiedEvents,
}));

import { askFrederick } from "./answer";

type AskTestEvent = Event & {
  geo_confidence: "venue_match" | "exact_address" | "area" | "unknown";
};

function event(
  slug: string,
  title: string,
  municipality: string,
  geom: { lng: number; lat: number },
  overrides: Partial<Event> = {},
): AskTestEvent {
  return {
    slug,
    title,
    description: `${title} is scheduled tonight.`,
    starts_at: "2026-07-27T23:00:00.000Z",
    ends_at: "2026-07-28T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: `${title} venue`,
    address: "Frederick County, MD",
    geom,
    municipality,
    category: "music",
    audience: ["all"],
    is_free: true,
    source: "manual",
    is_verified: true,
    placement: "venue",
    geo_confidence: "venue_match",
    ...overrides,
  } as AskTestEvent;
}

describe("Ask event proximity", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it.each([
    "Anything fun tonight near me?",
    "What can I do within walking distance tonight?",
  ])("keeps %s inside the visitor's local radius", async (query) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T22:00:00.000Z"));

    const downtown = event(
      "downtown-show",
      "Downtown Show",
      "frederick",
      { lng: -77.4098, lat: 39.4139 },
    );
    const mountAiry = event(
      "mount-airy-show",
      "Mount Airy Show",
      "mount-airy",
      { lng: -77.1547, lat: 39.3762 },
    );
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [mountAiry, downtown],
      publicEvents: [mountAiry, downtown],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const result = await askFrederick(query, {
      origin: { lng: -77.4105, lat: 39.4143 },
      contextLabel: "Near you",
      canShowDistance: true,
    });

    expect(result.sources.map((source) => source.name)).toContain("Downtown Show");
    expect(result.sources.map((source) => source.name)).not.toContain("Mount Airy Show");
    expect(result.sources.every((source) => source.href !== "/events/mount-airy-show")).toBe(true);
    expect(result.sources.find((source) => source.name === "Downtown Show")?.distance).toBeTruthy();
  });

  it("answers tonight from the filtered evening pool and leads with Alive at Five", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T18:20:00.000Z")); // 2:20 PM Eastern

    const aliveAtFive = event(
      "alive-at-five-2026-08-13",
      "Alive at Five",
      "frederick",
      { lng: -77.4102, lat: 39.4128 },
      {
        starts_at: "2026-08-13T21:00:00.000Z",
        ends_at: "2026-08-14T00:00:00.000Z",
        venue_name: "Carroll Creek Amphitheater",
        ticket_url: "https://example.com/alive-at-five",
      },
    );
    const endingBeforeEvening = event(
      "game-time-frederick",
      "Game Time Frederick",
      "frederick",
      { lng: -77.4105, lat: 39.4143 },
      {
        starts_at: "2026-08-13T14:00:00.000Z",
        ends_at: "2026-08-13T19:00:00.000Z",
      },
    );
    const suspiciousDaylong = event(
      "summerfest-family-theatre",
      "Summerfest Family Theatre",
      "frederick",
      { lng: -77.4105, lat: 39.4143 },
      {
        starts_at: "2026-08-13T14:00:00.000Z",
        ends_at: "2026-08-14T02:45:00.000Z",
      },
    );
    const badEmmitsburgPoint = event(
      "emmitsburg-library-program",
      "Emmitsburg Library Program",
      "emmitsburg",
      // This is downtown Frederick, not Emmitsburg.
      { lng: -77.4105, lat: 39.4143 },
      {
        starts_at: "2026-08-13T22:00:00.000Z",
        ends_at: "2026-08-13T23:00:00.000Z",
        placement: "geocoded",
      },
    );
    badEmmitsburgPoint.geo_confidence = "area";
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [endingBeforeEvening, suspiciousDaylong, badEmmitsburgPoint, aliveAtFive],
      publicEvents: [endingBeforeEvening, suspiciousDaylong, badEmmitsburgPoint, aliveAtFive],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const result = await askFrederick(
      "What should I do tonight near downtown Frederick?",
      {
        origin: { lng: -77.4105, lat: 39.4143 },
        contextLabel: "Near you",
        canShowDistance: true,
      },
    );

    expect(result.sources[0]?.name).toBe("Alive at Five");
    expect(result.sources.map((source) => source.name)).toEqual(["Alive at Five"]);
    expect(result.answer).toContain("Alive at Five");
  });

  it("keeps an unqualified downtown request inside the Frederick downtown core", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T18:20:00.000Z"));

    const downtown = event(
      "downtown-evening",
      "Downtown Evening",
      "frederick",
      { lng: -77.4102, lat: 39.4128 },
      {
        starts_at: "2026-08-13T22:00:00.000Z",
        ends_at: "2026-08-14T00:00:00.000Z",
      },
    );
    const outsideCore = event(
      "outside-downtown-evening",
      "Outside Downtown Evening",
      "frederick",
      { lng: -77.502, lat: 39.421 },
      {
        starts_at: "2026-08-13T22:00:00.000Z",
        ends_at: "2026-08-14T00:00:00.000Z",
      },
    );
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [outsideCore, downtown],
      publicEvents: [outsideCore, downtown],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const result = await askFrederick("What should I do downtown tonight?", {
      origin: { lng: -77.4105, lat: 39.4143 },
      contextLabel: "Near you",
      canShowDistance: true,
    });

    expect(result.sources.map((source) => source.name)).toContain("Downtown Evening");
    expect(result.sources.map((source) => source.name)).not.toContain("Outside Downtown Evening");
  });

  it("treats a named downtown as that town rather than Downtown Frederick", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T18:20:00.000Z"));

    const brunswick = event(
      "brunswick-evening",
      "Brunswick Evening",
      "brunswick",
      { lng: -77.6271, lat: 39.3131 },
      {
        starts_at: "2026-08-13T22:00:00.000Z",
        ends_at: "2026-08-14T00:00:00.000Z",
      },
    );
    const frederick = event(
      "frederick-evening",
      "Frederick Evening",
      "frederick",
      { lng: -77.4102, lat: 39.4128 },
      {
        starts_at: "2026-08-13T22:00:00.000Z",
        ends_at: "2026-08-14T00:00:00.000Z",
      },
    );
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [frederick, brunswick],
      publicEvents: [frederick, brunswick],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const result = await askFrederick(
      "What events are happening in downtown Brunswick tonight?",
      {
        origin: { lng: -77.4105, lat: 39.4143 },
        municipality: "frederick",
        contextLabel: "Frederick",
        canShowDistance: true,
      },
    );

    expect(result.sources.map((source) => source.name)).toContain("Brunswick Evening");
    expect(result.sources.map((source) => source.name)).not.toContain("Frederick Evening");
  });

  it("honors a named town for an undated event search", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T18:20:00.000Z"));

    const brunswick = event(
      "brunswick-weekend-event",
      "Brunswick Weekend Event",
      "brunswick",
      { lng: -77.6271, lat: 39.3131 },
      {
        starts_at: "2026-08-15T22:00:00.000Z",
        ends_at: "2026-08-16T00:00:00.000Z",
      },
    );
    const frederick = event(
      "frederick-weekend-event",
      "Frederick Weekend Event",
      "frederick",
      { lng: -77.4102, lat: 39.4128 },
      {
        starts_at: "2026-08-15T22:00:00.000Z",
        ends_at: "2026-08-16T00:00:00.000Z",
      },
    );
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [frederick, brunswick],
      publicEvents: [frederick, brunswick],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const result = await askFrederick("What events are happening in Brunswick?", {
      origin: { lng: -77.4105, lat: 39.4143 },
      municipality: "frederick",
      contextLabel: "Frederick",
      canShowDistance: true,
    });

    expect(result.sources.map((source) => source.name)).toContain("Brunswick Weekend Event");
    expect(result.sources.map((source) => source.name)).not.toContain("Frederick Weekend Event");
  });

  it("does not publish a precise distance for a point that conflicts with its town", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T18:20:00.000Z"));

    const badEmmitsburgPoint = event(
      "emmitsburg-evening",
      "Emmitsburg Evening Program",
      "emmitsburg",
      { lng: -77.4105, lat: 39.4143 },
      {
        starts_at: "2026-08-13T22:00:00.000Z",
        ends_at: "2026-08-13T23:00:00.000Z",
        placement: "geocoded",
      },
    );
    badEmmitsburgPoint.geo_confidence = "area";
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [badEmmitsburgPoint],
      publicEvents: [badEmmitsburgPoint],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const result = await askFrederick("What should I do tonight?", {
      origin: { lng: -77.4105, lat: 39.4143 },
      contextLabel: "Near you",
      canShowDistance: true,
    });

    expect(result.sources[0]?.name).toBe("Emmitsburg Evening Program");
    expect(result.sources[0]?.distance).toBeUndefined();
  });

  it("lets an explicit county region override the visitor's current municipality", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T18:20:00.000Z"));

    const brunswick = event(
      "brunswick-weekend-event",
      "Brunswick Weekend Event",
      "brunswick",
      { lng: -77.6271, lat: 39.3131 },
      {
        starts_at: "2026-08-15T22:00:00.000Z",
        ends_at: "2026-08-16T00:00:00.000Z",
      },
    );
    const middletown = event(
      "middletown-weekend-event",
      "Middletown Weekend Event",
      "middletown",
      { lng: -77.5447, lat: 39.4437 },
      {
        starts_at: "2026-08-16T18:00:00.000Z",
        ends_at: "2026-08-16T20:00:00.000Z",
      },
    );
    const downtown = event(
      "frederick-weekend-event",
      "Frederick Weekend Event",
      "frederick",
      { lng: -77.4105, lat: 39.4143 },
      {
        starts_at: "2026-08-15T23:00:00.000Z",
        ends_at: "2026-08-16T01:00:00.000Z",
      },
    );
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [downtown, brunswick, middletown],
      publicEvents: [downtown, brunswick, middletown],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const result = await askFrederick(
      "What events are happening in western Frederick County this weekend?",
      {
        origin: { lng: -77.4105, lat: 39.4143 },
        municipality: "frederick",
        contextLabel: "Frederick",
        canShowDistance: true,
      },
    );

    expect(result.sources.map((source) => source.name)).toEqual(
      expect.arrayContaining(["Brunswick Weekend Event", "Middletown Weekend Event"]),
    );
    expect(result.sources.map((source) => source.name)).not.toContain(
      "Frederick Weekend Event",
    );
  });
});
