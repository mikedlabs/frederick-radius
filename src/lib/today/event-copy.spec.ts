import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import {
  todayEventCategory,
  todayEventSourceLabel,
  todayEventWhere,
  todayEventWhy,
  todayVenueIsStreetAddress,
} from "./event-copy";

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
  const beforeTheWeek = new Date("2026-10-01T16:00:00.000Z");

  it("prefers a derived reason over category", () => {
    expect(todayEventWhy(event({ is_free: true }), beforeTheWeek)).toBe("Free");
  });

  it("uses the category name when no reason or description exists", () => {
    expect(
      todayEventWhy(event({ is_free: false, description: "" }), beforeTheWeek),
    ).toBe("Live music");
  });
});

describe("todayEventSourceLabel", () => {
  it("uses the shared source boundary", () => {
    expect(todayEventSourceLabel(event())).toBe("Ticketmaster");
  });

  it("never falls back to a Verified stamp", () => {
    expect(
      todayEventSourceLabel(event({ source: undefined, is_verified: true })),
    ).toBeNull();
    expect(
      todayEventSourceLabel(
        event({
          source: undefined,
          is_verified: true,
          organizer: "Catoctin Colorfest, Inc.",
        }),
      ),
    ).toBe("Catoctin Colorfest, Inc.");
  });
});

describe("todayEventCategory", () => {
  it("keeps a known family or library slug at full visual weight", () => {
    expect(todayEventCategory(event({ category: "library" })).slug).toBe("library");
    expect(todayEventCategory(event({ category: "family" })).name).toBe("Family");
  });

  it("uses Community when the row has no category yet", () => {
    const row = todayEventCategory(event({ category: "", source: "county" }));
    expect(row.slug).toBe("community");
    expect(row.name).toBe("Community");
  });

  it("gives uncategorized FCPL programs the library cue", () => {
    expect(
      todayEventCategory(event({ category: "", source: "fcpl" })).slug,
    ).toBe("library");
  });
});

describe("todayEventWhere", () => {
  it("treats a numbered street as an address, not a place name", () => {
    expect(todayVenueIsStreetAddress("110 E Patrick St")).toBe(true);
    expect(todayVenueIsStreetAddress("Patrick Street Pub")).toBe(false);
    expect(
      todayEventWhere(
        event({
          venue_name: "110 E Patrick St",
          municipality_name: "Frederick",
        }),
      ),
    ).toEqual({ kind: "address", text: "110 E Patrick St · Frederick" });
  });

  it("keeps a named venue as a place", () => {
    expect(todayEventWhere(event())).toEqual({
      kind: "place",
      text: "Weinberg Center · Frederick",
    });
  });
});
