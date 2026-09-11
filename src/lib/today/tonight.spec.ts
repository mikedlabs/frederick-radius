import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { isSameTodayListing, pickTonightEvent, splitTonightFeature, withoutTodayFeature } from "./tonight";

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

  it("selects the July 23 Alive at Five listing before the event begins", () => {
    const now = new Date("2026-07-23T18:00:00.000Z"); // 2 PM Eastern
    const aliveAtFive = event({
      slug: "alive-at-five-2026-07-23",
      title: "Alive @ Five · Stitch Early",
      starts_at: "2026-07-23T21:00:00.000Z",
      ends_at: "2026-07-24T00:00:00.000Z",
      venue_name: "Carroll Creek Amphitheater",
      ticket_url: "https://downtownfrederick.org/aliveatfive/",
      price_text: "$5 admission · 21+",
      hero_image: undefined,
    });
    const trivia = event({
      slug: "later-trivia",
      title: "Pour House Trivia",
      starts_at: "2026-07-23T23:00:00.000Z",
      ends_at: "2026-07-24T01:00:00.000Z",
      category: "nightlife",
      hero_image: "/images/trivia.jpg",
    });

    expect(pickTonightEvent(now, [trivia, aliveAtFive])?.slug).toBe(aliveAtFive.slug);
  });

  it("does not let a small live listing displace a clearly larger event later today", () => {
    const now = new Date("2026-07-23T18:55:00.000Z"); // 2:55 PM Eastern
    const natureWalk = event({
      slug: "nature-walk",
      title: "Queer Naturalist Club: Nature Walk",
      starts_at: "2026-07-23T18:00:00.000Z",
      ends_at: "2026-07-23T20:00:00.000Z",
      category: "outdoors",
      is_free: true,
      ticket_url: undefined,
      price_text: undefined,
    });
    const aliveAtFive = event({
      slug: "alive-at-five-2026-07-23",
      title: "Alive @ Five · Stitch Early",
      starts_at: "2026-07-23T21:00:00.000Z",
      ends_at: "2026-07-24T00:00:00.000Z",
      venue_name: "Carroll Creek Amphitheater",
      ticket_url: "https://downtownfrederick.org/aliveatfive/",
      price_text: "$5 admission · 21+",
      hero_image: undefined,
    });

    expect(pickTonightEvent(now, [natureWalk, aliveAtFive])?.slug).toBe(aliveAtFive.slug);
  });

  it("recognizes the same occurrence from feeds with different slugs and punctuation", () => {
    const a = event({ slug: "curated-alive", title: "Alive @ Five · La Unica", starts_at: "2026-07-16T21:00:00.000Z" });
    const b = event({ slug: "feed-alive", title: "Alive @ Five - La Unica", starts_at: "2026-07-16T21:00:00.000Z" });
    expect(isSameTodayListing(a, b)).toBe(true);
  });

  it("keeps the selected lead exactly once when duplicate feeds describe it", () => {
    const now = new Date("2026-07-16T21:30:00.000Z");
    const curated = event({
      slug: "curated-alive",
      title: "Alive @ Five · La Unica",
      starts_at: "2026-07-16T21:00:00.000Z",
      ends_at: "2026-07-17T00:00:00.000Z",
    });
    const feedDuplicate = event({
      slug: "feed-alive",
      title: "Alive @ Five - La Unica",
      starts_at: "2026-07-16T21:00:00.000Z",
      ends_at: "2026-07-17T00:00:00.000Z",
    });
    const trivia = event({ slug: "trivia", title: "Trivia Night" });

    const { feature, remaining } = splitTonightFeature(now, [trivia, feedDuplicate, curated]);
    const visible = feature ? [feature, ...remaining] : remaining;

    expect(feature?.title).toContain("Alive @ Five");
    expect(visible.filter((item) => isSameTodayListing(item, curated))).toHaveLength(1);
    expect(remaining.map((item) => item.slug)).toContain("trivia");
  });

  it("removes a duplicate that another Today bucket classified differently", () => {
    const feature = event({
      slug: "curated-alive",
      title: "Alive @ Five · La Unica",
      starts_at: "2026-07-16T21:00:00.000Z",
    });
    const routineBucket = [
      event({
        slug: "feed-alive",
        title: "Alive @ Five - La Unica",
        starts_at: "2026-07-16T21:00:00.000Z",
        category: "civic",
      }),
      event({ slug: "storytime", title: "Library Storytime" }),
    ];

    expect(withoutTodayFeature(feature, routineBucket).map((item) => item.slug)).toEqual(["storytime"]);
  });
});
