import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventPosterCard from "@/components/event/EventPosterCard";
import EventCard from "@/components/event/EventCard";

function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "summer-concert",
    title: "Summer concert",
    description: "",
    starts_at: "2026-07-28T22:00:00.000Z",
    ends_at: "2026-07-29T00:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Baker Park",
    address: "121 N Bentz St, Frederick, MD",
    geom: { lng: -77.417, lat: 39.417 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: false,
    source: "manual",
    is_verified: true,
    geo_confidence: "venue_match",
    category_name: "Music",
    municipality_name: "Frederick",
    last_verified_at: "2026-07-28T12:00:00.000Z",
    ...overrides,
  } as EventWithMeta;
}

describe("EventPosterCard visual trust", () => {
  it("falls back to honest category artwork for an unattributed place photo", () => {
    const html = renderToStaticMarkup(
      createElement(EventPosterCard, {
        event: event({
          slug: "raw-place-photo",
          source: "ticketmaster",
          hero_image: "/api/place-photo?name=unattributed",
        }),
      }),
    );

    expect(html).toContain('data-event-poster="category"');
    expect(html).toContain('data-radius-plate="raw-place-photo"');
    expect(html).not.toContain("/api/place-photo");
  });

  it("renders a source-captioned image approved by eventCardVisual", () => {
    const html = renderToStaticMarkup(
      createElement(EventPosterCard, {
        event: event({
          source: "ticketmaster",
          hero_image: "https://s1.ticketm.net/dam/a/approved-event.jpg",
        }),
      }),
    );

    expect(html).toContain('data-event-poster="photo"');
    expect(html).toContain("Image via Ticketmaster");
    expect(html).not.toContain("data-radius-plate");
  });

  it("keeps a photo-less EventCard feature in the poster layout", () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event({ hero_image: undefined }),
        variant: "feature",
      }),
    );

    expect(html).toContain('data-event-poster="category"');
    expect(html).toContain('data-radius-plate="summer-concert"');
  });

  it("keeps desktop shelf cards tall enough for their content", () => {
    const html = renderToStaticMarkup(
      createElement(EventPosterCard, {
        event: event(),
        layout: "shelf",
      }),
    );

    expect(html).toContain("lg:aspect-[4/3]");
    expect(html).not.toContain("lg:aspect-[21/9]");
  });
});
