import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import TodayEventPick from "./TodayEventPick";

vi.mock("@/components/saved/SaveButton", () => ({
  default: () => null,
}));

function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "alive-at-five",
    title: "Alive @ Five",
    description: "Free Friday concert on Carroll Creek.",
    starts_at: "2026-10-10T21:00:00.000Z",
    ends_at: "2026-10-10T23:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Carroll Creek Amphitheater",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: true,
    source: "dfp",
    is_verified: true,
    geo_confidence: "venue_match",
    category_name: "Live music",
    municipality_name: "Frederick",
    last_verified_at: "2026-10-10T12:00:00.000Z",
    ...overrides,
  } as EventWithMeta;
}

describe("TodayEventPick", () => {
  it("keeps time, place, town, why, source, and a category treatment without an image", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventPick, { event: event(), variant: "lead" }),
    );
    expect(html).toContain("Alive @ Five");
    expect(html).toContain("Carroll Creek Amphitheater");
    expect(html).toContain("Frederick");
    expect(html).toContain("Downtown Frederick Partnership");
    expect(html).toContain('data-today-event-visual="category"');
    expect(html).toContain("Free");
    expect(html).not.toContain("SUMMER CARROL CREEK");
  });

  it("shows an allowlisted publisher image on the lead card", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventPick, {
        event: event({
          source: "ticketmaster",
          hero_image: "https://s1.ticketm.net/dam/a/example.jpg",
        }),
        variant: "lead",
      }),
    );
    expect(html).toContain('data-today-event-visual="photo"');
    expect(html).toContain("s1.ticketm.net/dam/a/example.jpg");
    expect(html).toContain("Event image · Ticketmaster");
  });

  it("formats FCPL space-separated start times through the shared date block", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventPick, {
        event: event({
          starts_at: "2026-10-11 18:00:00+00",
          ends_at: "2026-10-11 19:00:00+00",
        }),
      }),
    );
    expect(html).toContain("2:00 PM");
    expect(html).not.toContain("Invalid Date");
  });
});
