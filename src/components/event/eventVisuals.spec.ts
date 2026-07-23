import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventCardVisual, planHorizonVisual } from "./eventVisuals";

function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "test-event",
    title: "Test event",
    description: "",
    starts_at: "2026-07-23T22:00:00.000Z",
    ends_at: "2026-07-24T00:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Test venue",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: false,
    source: "manual",
    is_verified: true,
    geo_confidence: "venue_match",
    category_name: "Music",
    municipality_name: "Frederick",
    last_verified_at: "2026-07-23T12:00:00.000Z",
    ...overrides,
  } as EventWithMeta;
}

describe("eventCardVisual", () => {
  it("uses an exact Carroll Creek venue match and labels it as venue photography", () => {
    expect(
      eventCardVisual(
        event({ venue_place_slug: "carroll-creek-outdoor-amphitheater" }),
      ),
    ).toEqual({
      src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
      caption: "Carroll Creek · Radius photo",
      key: "radius-carroll-creek-summer",
    });
  });

  it("does not guess from a venue name or a nearby coordinate", () => {
    expect(
      eventCardVisual(
        event({
          venue_name: "Carroll Creek Outdoor Amphitheater",
          venue_place_slug: undefined,
        }),
      ),
    ).toBeNull();
  });

  it("credits allowlisted event-image providers", () => {
    expect(
      eventCardVisual(
        event({
          source: "ticketmaster",
          hero_image: "https://s1.ticketm.net/dam/a/example.jpg",
        }),
      ),
    ).toMatchObject({ caption: "Image via Ticketmaster" });

    expect(
      eventCardVisual(
        event({
          source: "seatgeek",
          hero_image: "https://seatgeek.com/images/example.jpg",
        }),
      ),
    ).toMatchObject({ caption: "Image via SeatGeek" });
  });

  it("does not promote an unattributed place-photo proxy", () => {
    expect(
      eventCardVisual(
        event({
          source: "ticketmaster",
          hero_image: "/api/place-photo?name=unattributed",
        }),
      ),
    ).toBeNull();
  });
});

describe("planHorizonVisual", () => {
  it("keeps a visual lead and does not promote a second image", () => {
    const lead = event({
      slug: "lead",
      venue_place_slug: "carroll-creek-outdoor-amphitheater",
    });
    const rest = [
      event({ slug: "second", venue_place_slug: "baker-park-frederick" }),
    ];

    const plan = planHorizonVisual(lead, rest);
    expect(plan.leadVisual?.key).toBe("radius-carroll-creek-summer");
    expect(plan.promotedIndex).toBe(-1);
    expect(plan.promotedVisual).toBeNull();
  });

  it("promotes the first safe visual at its existing chronological index", () => {
    const lead = event({ slug: "lead" });
    const rest = [
      event({ slug: "second" }),
      event({ slug: "third", venue_place_slug: "baker-park-frederick" }),
      event({
        slug: "fourth",
        venue_place_slug: "carroll-creek-outdoor-amphitheater",
      }),
    ];

    const plan = planHorizonVisual(lead, rest);
    expect(plan.leadVisual).toBeNull();
    expect(plan.promotedIndex).toBe(1);
    expect(rest[plan.promotedIndex].slug).toBe("third");
    expect(plan.promotedVisual?.key).toBe("radius-baker-park-bandshell");
  });
});
