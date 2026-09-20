import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { EventWithMeta } from "@/lib/loaders/events";
import EventAgenda, { eventAgendaGroups } from "./EventAgenda";

const NOW = Date.parse("2026-09-20T10:00:00-04:00");

function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "test-event",
    title: "A scheduled event",
    description: "",
    starts_at: "2026-09-20T16:00:00-04:00",
    ends_at: "2026-09-20T18:00:00-04:00",
    timezone: "America/New_York",
    venue_name: "Test Venue",
    address: "1 Test Street",
    geom: { lng: -77.41, lat: 39.41 },
    municipality: "frederick",
    municipality_name: "Frederick",
    category: "arts",
    category_name: "Arts",
    audience: [],
    is_free: true,
    source: "manual",
    is_verified: true,
    source_id: "test-event",
    source_url: "https://example.com/event",
    license: "test",
    confidence: "curated",
    first_seen_at: "2026-09-19T12:00:00Z",
    last_verified_at: "2026-09-19T12:00:00Z",
    geo_confidence: "venue_match",
    ...overrides,
  };
}

function render(events: EventWithMeta[]): string {
  return renderToStaticMarkup(createElement(EventAgenda, { events, nowMs: NOW }));
}

describe("EventAgenda date and time truth", () => {
  it("puts continuing ranges after scheduled dates instead of under their past opening day", () => {
    const ongoing = event({
      slug: "ongoing-exhibit",
      title: "An ongoing exhibition",
      starts_at: "2026-09-01T12:00:00-04:00",
      ends_at: "2026-09-30T23:59:59-04:00",
    });
    const scheduled = event();
    const input = [ongoing, scheduled];
    const before = structuredClone(input);
    const groups = eventAgendaGroups(input, NOW);

    expect(groups.map((group) => group.heading)).toEqual([
      "Sun · Sep 20",
      "Ongoing listings",
    ]);
    expect(groups[0].events).toEqual([scheduled]);
    expect(groups[1].events).toEqual([ongoing]);
    expect(input).toEqual(before);

    const html = render(input);
    expect(html).toContain("Tue, Sep 1 – Wed, Sep 30");
    expect(html).toContain("Check the publisher for individual dates and opening hours.");
    expect(html).not.toContain("12:00pm");
    expect(html).not.toContain("Tue · Sep 1");
  });

  it("shows the included date range for ongoing all-day events, respecting exclusive ends", () => {
    const html = render([event({
      is_all_day: true,
      starts_at: "2026-09-18T00:00:00-04:00",
      ends_at: "2026-09-21T00:00:00-04:00",
    })]);

    expect(html).toContain("Ongoing listings");
    expect(html).toContain("Fri, Sep 18 – Sun, Sep 20");
    expect(html).not.toContain("Sep 21");
    expect(html).not.toContain("12:00am");
  });

  it("keeps future range opening dates but never renders their anchor as a start clock", () => {
    const html = render([event({
      starts_at: "2026-09-22T12:00:00-04:00",
      ends_at: "2026-09-30T18:00:00-04:00",
    })]);

    expect(html).toContain("Tue · Sep 22");
    expect(html).toContain("through Sep 30");
    expect(html).not.toContain("12:00pm");
    expect(html).not.toContain("Ongoing listings");
  });

  it("preserves known clocks and explicitly unknown or all-day timing", () => {
    expect(render([event()])).toContain("4:00pm");
    expect(render([event({
      is_all_day: true,
      starts_at: "2026-09-20T00:00:00-04:00",
      ends_at: "2026-09-21T00:00:00-04:00",
    })])).toContain("All day");
    const unknownTime = render([event({
      starts_at: "2026-09-20T12:00:00-04:00",
      ends_at: "2026-09-20T23:59:59-04:00",
    })]);
    expect(unknownTime).toContain("Time not listed");
    expect(unknownTime).not.toContain("12:00pm");
  });

  it("keeps the dated-day limit separate from ongoing listings and removes ended events", () => {
    const groups = eventAgendaGroups([
      event(),
      event({ slug: "tomorrow", starts_at: "2026-09-21T16:00:00-04:00", ends_at: "2026-09-21T18:00:00-04:00" }),
      event({ slug: "ongoing", starts_at: "2026-09-01T12:00:00-04:00", ends_at: "2026-09-30T18:00:00-04:00" }),
      event({ slug: "ended", starts_at: "2026-09-01T12:00:00-04:00", ends_at: "2026-09-19T18:00:00-04:00" }),
      event({ slug: "stale", starts_at: "2026-01-01T12:00:00-05:00", ends_at: "2026-12-31T18:00:00-05:00" }),
    ], NOW, 1);

    expect(groups.map((group) => group.heading)).toEqual(["Sun · Sep 20", "Ongoing listings"]);
    expect(groups.flatMap((group) => group.events.map((item) => item.slug))).toEqual(["test-event", "ongoing"]);
  });

  it("does not advertise an unsupported month filter in the standalone empty fallback", () => {
    const html = render([]);
    expect(html).toContain("/events?lens=all");
    expect(html).toContain("All upcoming events");
    expect(html).not.toContain("lens=month");
  });
});
