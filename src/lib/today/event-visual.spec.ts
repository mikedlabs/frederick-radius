import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { clientPlaces } from "@/lib/loaders/places-client";
import { todayEventVisual } from "./event-visual";

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

describe("todayEventVisual", () => {
  it("never uses the archive seasonal photographs", () => {
    expect(
      todayEventVisual(
        event({ venue_place_slug: "carroll-creek-linear-park-frederick" }),
      ),
    ).toBeNull();
  });

  it("keeps an allowlisted publisher event image", () => {
    expect(
      todayEventVisual(
        event({
          source: "ticketmaster",
          hero_image: "https://s1.ticketm.net/dam/a/example.jpg",
        }),
      ),
    ).toMatchObject({
      src: "https://s1.ticketm.net/dam/a/example.jpg",
      caption: "Event image · Ticketmaster",
    });
  });

  it("uses a place_id catalog photo when the event has no approved image", () => {
    const place = clientPlaces().find((row) => row.google_photo_url);
    expect(place).toBeTruthy();
    const visual = todayEventVisual(
      event({ place_id: place!.slug } as EventWithMeta & { place_id: string }),
    );
    expect(visual).toMatchObject({
      src: place!.google_photo_url,
      caption: `Venue · ${place!.name}`,
    });
  });

  it("falls back to no image when place_id does not resolve", () => {
    expect(
      todayEventVisual(
        event({ place_id: "not-a-real-place" } as EventWithMeta & {
          place_id: string;
        }),
      ),
    ).toBeNull();
  });
});
