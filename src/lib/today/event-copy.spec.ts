import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { todayEventSourceLabel, todayEventWhy } from "./event-copy";

function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "test-event",
    title: "Test event",
    description: "",
    starts_at: "2026-10-10T23:00:00.000Z",
    ends_at: "2026-10-11T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Weinberg Center",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: true,
    source: "ticketmaster",
    is_verified: true,
    geo_confidence: "venue_match",
    category_name: "Live music",
    municipality_name: "Frederick",
    last_verified_at: "2026-10-10T12:00:00.000Z",
    ...overrides,
  } as EventWithMeta;
}

describe("todayEventWhy", () => {
  it("prefers a derived reason over category", () => {
    expect(todayEventWhy(event({ is_free: true }))).toBe("Free");
  });

  it("uses the category name when no reason or description exists", () => {
    expect(todayEventWhy(event({ is_free: false, description: "" }))).toBe(
      "Live music",
    );
  });
});

describe("todayEventSourceLabel", () => {
  it("uses the shared source boundary", () => {
    expect(todayEventSourceLabel(event())).toBe("Ticketmaster");
  });
});
