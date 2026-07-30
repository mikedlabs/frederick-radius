import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import TonightHeadline from "./TonightHeadline";

function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "summer-concert",
    title: "Summer concert",
    description: "",
    starts_at: "2026-07-26T23:00:00.000Z",
    ends_at: "2026-07-27T01:00:00.000Z",
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

const now = new Date("2026-07-26T16:00:00.000Z");

describe("TonightHeadline", () => {
  it("keeps a long title readable and untruncated on narrow screens", () => {
    const longTitle =
      "Frederick County Community Orchestra Summer Concert Along Carroll Creek";
    const html = renderToStaticMarkup(
      createElement(TonightHeadline, {
        event: event({ title: longTitle }),
        now,
      }),
    );

    expect(html).toContain(longTitle);
    expect(html).toContain("font-editorial");
    expect(html).toContain("text-[clamp(1.875rem,9vw,2.75rem)]");
    expect(html).toContain("break-words");
    expect(html).toContain("min-w-0");
    expect(html).not.toContain("truncate");
    expect(html).not.toContain("line-clamp");
  });

  it("uses a quiet event affordance instead of promoting an unapproved image", () => {
    const html = renderToStaticMarkup(
      createElement(TonightHeadline, {
        event: event({
          hero_image: "https://example.test/unattributed-event.jpg",
        }),
        now,
      }),
    );

    expect(html).toContain(
      'aria-labelledby="today-headliner-summer-concert-title"',
    );
    expect(html).toContain(
      'aria-describedby="today-headliner-summer-concert-detail"',
    );
    expect(html).toContain(">View event<");
    expect(html).toContain("border-y");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("unattributed-event.jpg");
  });

  it("keeps approved event photography and its attribution", () => {
    const html = renderToStaticMarkup(
      createElement(TonightHeadline, {
        event: event({
          source: "ticketmaster",
          hero_image: "https://s1.ticketm.net/dam/a/approved-event.jpg",
        }),
        now,
      }),
    );

    expect(html).toContain("<img");
    expect(html).toContain("approved-event.jpg");
    expect(html).toContain("Event image · Ticketmaster");
    expect(html).not.toContain(">View event<");
  });

  it("keeps the full venue-photo credit outside the event link", () => {
    const html = renderToStaticMarkup(
      createElement(TonightHeadline, {
        event: event({
          hero_image: "/api/place-photo?name=places%2Fvenue-photo",
          hero_image_attribution: {
            kind: "venue",
            venue_name: "Test venue",
            provider: "google_maps",
            source_uri: "https://maps.google.com/?cid=123",
            flag_content_uri: "https://support.google.com/legal/troubleshooter/1114905",
            authors: [
              {
                display_name: "Test photographer",
                uri: "https://maps.google.com/contrib/123",
              },
            ],
          },
        }),
        now,
      }),
    );

    expect(html).toContain("Venue · Test venue");
    expect(html).toContain("Test photographer");
    expect(html).toContain("Report photo");
    expect(html.indexOf("</a>")).toBeLessThan(html.indexOf("Venue · Test venue"));
    expect(html).toContain('src="/api/place-photo?name=places%2Fvenue-photo"');
    expect(html).not.toContain("/_next/image");
  });

  it("keeps optional hover motion behind the reduced-motion preference", () => {
    const imageHtml = renderToStaticMarkup(
      createElement(TonightHeadline, {
        event: event({
          source: "ticketmaster",
          hero_image: "https://s1.ticketm.net/dam/a/approved-event.jpg",
        }),
        now,
      }),
    );
    const noImageHtml = renderToStaticMarkup(
      createElement(TonightHeadline, {
        event: event(),
        now,
      }),
    );

    expect(imageHtml).toContain(
      "motion-safe:group-hover:scale-[1.015]",
    );
    expect(noImageHtml).toContain(
      "motion-safe:group-hover:translate-x-0.5",
    );
    expect(imageHtml).not.toMatch(/(?<!motion-safe:)group-hover:scale/);
    expect(noImageHtml).not.toMatch(/(?<!motion-safe:)group-hover:translate/);
  });
});
