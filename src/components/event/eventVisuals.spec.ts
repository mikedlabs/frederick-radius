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
  it("uses an exact Carroll Creek Linear Park match and labels it as venue photography", () => {
    expect(
      eventCardVisual(
        event({ venue_place_slug: "carroll-creek-linear-park-frederick" }),
      ),
    ).toEqual({
      src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
      caption: "Venue · Carroll Creek Linear Park · Radius photo",
      key: "radius-carroll-creek-summer",
    });
  });

  it("does not use a broad Carroll Creek aerial as an exact amphitheater image", () => {
    expect(
      eventCardVisual(
        event({ venue_place_slug: "carroll-creek-outdoor-amphitheater" }),
      ),
    ).toBeNull();
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
    ).toMatchObject({ caption: "Event image · Ticketmaster" });

    expect(
      eventCardVisual(
        event({
          source: "seatgeek",
          hero_image: "https://seatgeek.com/images/example.jpg",
        }),
      ),
    ).toMatchObject({ caption: "Event image · SeatGeek" });
  });

  it.each([
    [
      "dfp",
      "https://ik.imagekit.io/vibemap/events/example.jpg",
      "Event image · Downtown Frederick Partnership",
    ],
    [
      "visit-frederick",
      "https://assets.simpleviewinc.com/sv-frederick-county/image/fetch/example.jpg",
      "Event image · Visit Frederick",
    ],
    [
      "fcpl",
      "https://frederick.librarycalendar.com/sites/default/files/example.jpg",
      "Event image · Frederick County Public Libraries",
    ],
    [
      "mdcc",
      "https://static.wixstatic.com/media/6bde7e_opening.jpg",
      "Event image · Maryland Deaf Community Center",
    ],
  ] as const)(
    "accepts publisher event art from %s only on its exact host",
    (source, hero_image, caption) => {
      expect(
        eventCardVisual(
          event({
            source,
            source_url: "https://publisher.example/event",
            hero_image,
          }),
        ),
      ).toMatchObject({
        caption,
        sourceHref: "https://publisher.example/event",
      });
    },
  );

  it("rejects a source-approved event with an image on the wrong host", () => {
    expect(
      eventCardVisual(
        event({
          source: "ticketmaster",
          hero_image: "https://example.com/not-ticketmaster.jpg",
        }),
      ),
    ).toBeNull();
  });

  it.each([
    "http://static.wixstatic.com/media/6bde7e_opening.jpg",
    "https://static.wixstatic.com:444/media/6bde7e_opening.jpg",
    "https://static.wixstatic.com/not-media/6bde7e_opening.jpg",
    "https://images.wixstatic.com/media/6bde7e_opening.jpg",
  ])("rejects an MDCC image outside its exact Wix HTTPS media policy", (hero_image) => {
    expect(
      eventCardVisual(
        event({
          source: "mdcc",
          hero_image,
        }),
      ),
    ).toBeNull();
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

  it("promotes a venue photo only when it carries its direct source credit", () => {
    const attribution = {
      kind: "venue" as const,
      venue_name: "Test Venue",
      provider: "google_maps" as const,
      source_uri: "https://www.google.com/maps/place/example-photo",
      authors: [
        {
          display_name: "Local photographer",
          uri: "https://maps.google.com/maps/contrib/123",
        },
      ],
    };
    expect(
      eventCardVisual(
        event({
          hero_image: "/api/place-photo?name=credited",
          hero_image_attribution: attribution,
        }),
      ),
    ).toEqual({
      src: "/api/place-photo?name=credited",
      caption: "Venue · Test Venue",
      key: "venue:/api/place-photo?name=credited",
      attribution,
    });
  });
});

describe("planHorizonVisual", () => {
  it("keeps a visual lead and does not promote a second image", () => {
    const lead = event({
      slug: "lead",
      venue_place_slug: "carroll-creek-linear-park-frederick",
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
        venue_place_slug: "carroll-creek-linear-park-frederick",
      }),
    ];

    const plan = planHorizonVisual(lead, rest);
    expect(plan.leadVisual).toBeNull();
    expect(plan.promotedIndex).toBe(1);
    expect(rest[plan.promotedIndex].slug).toBe("third");
    expect(plan.promotedVisual?.key).toBe("radius-baker-park-bandshell");
  });
});
