import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.useRealTimers();
});

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
    expect(html).toContain('data-event-fallback="date-category"');
    expect(html).toContain(">28<");
    expect(html).toContain(">JUL<");
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
    expect(html).toContain("Event image · Ticketmaster");
    expect(html).toContain('alt=""');
    expect(html).not.toContain("data-event-fallback");
  });

  it("renders a credited venue image with its author and direct Google Maps source", () => {
    const html = renderToStaticMarkup(
      createElement(EventPosterCard, {
        event: event({
          hero_image: "/api/place-photo?name=credited",
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
      }),
    );

    expect(html).toContain('data-event-poster="photo"');
    expect(html).toContain("data-event-photo-credit");
    expect(html).toContain("Local photographer");
    expect(html).toContain("Google Maps");
    expect(html).toContain("https://www.google.com/maps/place/example-photo");
    const posterEnd = html.indexOf("</article>");
    const creditStart = html.indexOf("data-event-photo-credit");
    expect(posterEnd).toBeGreaterThan(-1);
    expect(creditStart).toBeGreaterThan(posterEnd);
    expect(html).not.toContain("bg-black/55");
  });

  it("keeps a photo-less EventCard feature in the poster layout", () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event({ hero_image: undefined }),
        variant: "feature",
      }),
    );

    expect(html).toContain('data-event-poster="category"');
    expect(html).toContain('data-event-fallback="date-category"');
  });

  it("does not render an unattributed place photo in a glance card", () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event({
          source: "manual",
          hero_image: "/api/place-photo?name=unattributed",
        }),
        variant: "glance",
      }),
    );

    expect(html).not.toContain("/api/place-photo");
    expect(html).not.toContain("<figcaption");
  });

  it("renders a lazy, source-captioned glance thumbnail from an approved provider", () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event({
          source: "ticketmaster",
          hero_image: "https://s1.ticketm.net/dam/a/glance-event.jpg",
        }),
        variant: "glance",
      }),
    );

    expect(html).toContain("Event image · Ticketmaster");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('alt=""');
    expect(html).toContain("text-[9px]");
  });

  it("renders full Google venue credit outside the glance card event link", () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event({
          hero_image: "/api/place-photo?name=credited-glance",
          hero_image_attribution: {
            kind: "venue",
            venue_name: "Baker Park",
            provider: "google_maps",
            source_uri: "https://www.google.com/maps/place/example-photo",
            flag_content_uri: "https://www.google.com/local/imagery/report/",
            authors: [
              {
                display_name: "Local photographer",
                uri: "https://maps.google.com/maps/contrib/123",
              },
            ],
          },
        }),
        variant: "glance",
      }),
    );

    const eventLinkStart = html.indexOf('href="/events/summer-concert"');
    const eventLinkEnd = html.indexOf("</a>", eventLinkStart);
    expect(eventLinkStart).toBeGreaterThan(-1);
    expect(eventLinkEnd).toBeGreaterThan(eventLinkStart);
    expect(html.slice(eventLinkStart, eventLinkEnd)).not.toContain(
      "Local photographer",
    );
    expect(html.slice(eventLinkEnd)).toContain("Local photographer");
    expect(html.slice(eventLinkEnd)).toContain("Google Maps");
    expect(html.slice(eventLinkEnd)).toContain("Report photo");
  });

  it("keeps a photo-less shelf useful without reserving a giant image ratio", () => {
    const html = renderToStaticMarkup(
      createElement(EventPosterCard, {
        event: event(),
        layout: "shelf",
      }),
    );

    expect(html).toContain("lg:min-h-[270px]");
    expect(html).not.toContain("lg:aspect-[4/3]");
  });

  it("refuses an unsupported live prop and explains a started event's unknown end", () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event({
          starts_at: "2026-07-30T09:15:00-04:00",
          ends_at: "2026-07-30T23:59:00-04:00",
        }),
        variant: "glance",
        live: true,
        nowISO: "2026-07-30T11:31:00-04:00",
      }),
    );

    expect(html).toContain("Started at 9:15 AM · end time unavailable");
    expect(html).not.toContain("live-dot");
    expect(html).not.toContain(">Now<");
  });

  it("rechecks a stale live prop against now and lifecycle status", () => {
    const futureHtml = renderToStaticMarkup(
      createElement(EventCard, {
        event: event({
          starts_at: "2026-07-30T18:00:00-04:00",
          ends_at: "2026-07-30T20:00:00-04:00",
        }),
        variant: "glance",
        live: true,
        nowISO: "2026-07-30T17:00:00-04:00",
      }),
    );
    const cancelledHtml = renderToStaticMarkup(
      createElement(EventCard, {
        event: event({
          starts_at: "2026-07-30T18:00:00-04:00",
          ends_at: "2026-07-30T20:00:00-04:00",
          status: "cancelled",
        }),
        variant: "glance",
        live: true,
        nowISO: "2026-07-30T19:00:00-04:00",
      }),
    );

    expect(futureHtml).not.toContain("live-dot");
    expect(futureHtml).not.toContain(">Now<");
    expect(cancelledHtml).not.toContain("live-dot");
    expect(cancelledHtml).not.toContain(">Now<");
    expect(cancelledHtml).toContain("Cancelled");
  });

  it("uses the injected card clock for reason chips in tile and poster layouts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-15T12:00:00.000Z"));
    const startsSoon = event({
      starts_at: "2026-07-30T19:00:00-04:00",
      ends_at: "2026-07-30T21:00:00-04:00",
    });
    const nowISO = "2026-07-30T18:00:00-04:00";

    const tileHtml = renderToStaticMarkup(
      createElement(EventCard, {
        event: startsSoon,
        variant: "tile",
        nowISO,
      }),
    );
    const posterHtml = renderToStaticMarkup(
      createElement(EventPosterCard, {
        event: startsSoon,
        nowISO,
      }),
    );

    expect(tileHtml).toContain("Starting soon");
    expect(posterHtml).toContain("Starting soon");
  });
});
