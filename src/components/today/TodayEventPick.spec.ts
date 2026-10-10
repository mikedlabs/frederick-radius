import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import TodayEventPick from "./TodayEventPick";

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
      createElement(TodayEventPick, {
        event: event(),
        variant: "lead",
        now: new Date("2026-10-01T16:00:00.000Z"),
      }),
    );
    expect(html).toContain("Alive @ Five");
    expect(html).toContain("Carroll Creek Amphitheater");
    expect(html).toContain("Frederick");
    expect(html).toContain("Downtown Frederick Partnership");
    expect(html).toContain('data-today-event-visual="category"');
    expect(html).toContain("Free");
    expect(html).not.toContain("SUMMER CARROL CREEK");
    expect(html).not.toContain("Verified");
    expect(html).not.toContain("Save ");
    expect(html.match(/href="\/events\/alive-at-five"/g)).toEqual([
      'href="/events/alive-at-five"',
    ]);
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
    expect(html).toContain("s1.ticketm.net%2Fdam%2Fa%2Fexample.jpg");
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

  it("uses Community when the row has no category", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventPick, {
        event: event({
          title: "County picnic",
          category: "",
          source: "county",
          is_free: false,
          description: "",
        }),
      }),
    );
    expect(html).toContain("Community");
    expect(html).toContain('data-today-category="community"');
    expect(html).not.toContain(">Event<");
  });

  it("gives uncategorized library programs the family/library cue", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventPick, {
        event: event({
          title: "Story time",
          category: "",
          source: "fcpl",
          venue_name: "C. Burr Artz Public Library",
          is_free: false,
          description: "",
        }),
        now: new Date("2026-10-01T16:00:00.000Z"),
      }),
    );
    expect(html).toContain("Libraries");
    expect(html).toContain('data-today-category="library"');
    expect(html).toContain("Free");
  });

  it("shows a bare street as an address, not a place name", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventPick, {
        event: event({
          venue_name: "110 E Patrick St",
          municipality_name: "Frederick",
        }),
      }),
    );
    expect(html).toContain('data-today-venue="address"');
    expect(html).toContain("110 E Patrick St · Frederick");
  });
});
