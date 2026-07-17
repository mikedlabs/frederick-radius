import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { isSameTodayListing, pickTonightEvent } from "./tonight";

function event(overrides: Partial<EventWithMeta>): EventWithMeta {
  return {
    slug: "event",
    title: "Event",
    description: "",
    starts_at: "2026-07-16T23:00:00.000Z",
    ends_at: "2026-07-17T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Downtown Frederick",
    address: "Frederick, MD",
    geom: { lat: 39.4143, lng: -77.4105 },
    municipality: "frederick",
    municipality_name: "Frederick",
    category: "music",
    category_name: "Live music",
    audience: [],
    is_free: false,
    source: "manual",
    is_verified: true,
    placement: "venue",
    geo_confidence: "venue_match",
    source_name: "Frederick Radius",
    source_type: "first_party",
    verification_level: "verified",
    last_verified_at: "2026-07-16T12:00:00.000Z",
    ...overrides,
  } as EventWithMeta;
}

describe("pickTonightEvent", () => {
  it("leads with a live marquee event over a later event with artwork", () => {
    const now = new Date("2026-07-16T21:30:00.000Z"); // 5:30 PM Eastern
    const aliveAtFive = event({
      slug: "alive-at-five-2026-07-16",
      title: "Alive @ Five · La Unica",
      starts_at: "2026-07-16T21:00:00.000Z",
      ends_at: "2026-07-17T00:00:00.000Z",
      hero_image: undefined,
    });
    const trivia = event({
      slug: "pour-house-trivia",
      title: "Pour House Trivia at Steinhardt Brewing Company",
      starts_at: "2026-07-16T23:00:00.000Z",
      ends_at: "2026-07-17T01:00:00.000Z",
      hero_image: "/images/trivia.jpg",
    });

    expect(pickTonightEvent(now, [trivia, aliveAtFive])?.slug).toBe(aliveAtFive.slug);
  });

  it("recognizes the same occurrence from feeds with different slugs and punctuation", () => {
    const a = event({ slug: "curated-alive", title: "Alive @ Five · La Unica", starts_at: "2026-07-16T21:00:00.000Z" });
    const b = event({ slug: "feed-alive", title: "Alive @ Five - La Unica", starts_at: "2026-07-16T21:00:00.000Z" });
    expect(isSameTodayListing(a, b)).toBe(true);
  });
});
