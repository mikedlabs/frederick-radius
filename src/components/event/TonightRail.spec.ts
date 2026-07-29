import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import TonightRail from "@/components/event/TonightRail";

function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "summer-concert",
    title: "Summer concert",
    description: "",
    starts_at: "2026-07-29T22:00:00.000Z",
    ends_at: "2026-07-30T00:00:00.000Z",
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
    last_verified_at: "2026-07-29T12:00:00.000Z",
    ...overrides,
  } as EventWithMeta;
}

describe("TonightRail visual trust", () => {
  it("uses category artwork instead of a Google venue photo it cannot fully credit", () => {
    const html = renderToStaticMarkup(
      createElement(TonightRail, {
        events: [
          event({
            hero_image: "/api/place-photo?name=credited-venue",
            hero_image_attribution: {
              kind: "venue",
              venue_name: "Baker Park",
              provider: "google_maps",
              source_uri: "https://www.google.com/maps/place/example-photo",
              authors: [
                {
                  display_name: "Local photographer",
                  uri: "https://maps.google.com/maps/contrib/123",
                },
              ],
            },
          }),
        ],
      }),
    );

    expect(html).not.toContain("/api/place-photo");
    expect(html).not.toContain("Local photographer");
    expect(html).toContain('data-radius-plate="summer-concert"');
  });

  it("keeps approved publisher imagery and prints its source inside the card", () => {
    const html = renderToStaticMarkup(
      createElement(TonightRail, {
        events: [
          event({
            source: "ticketmaster",
            hero_image: "https://s1.ticketm.net/dam/a/summer-concert.jpg",
          }),
        ],
      }),
    );

    expect(html).toContain("s1.ticketm.net");
    expect(html).toContain("Event image · Ticketmaster");
    expect(html).not.toContain("data-radius-plate");
  });
});
