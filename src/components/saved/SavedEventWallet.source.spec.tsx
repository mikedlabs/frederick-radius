import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Event } from "@/data/events";
import SavedEventWallet from "./SavedEventWallet";

const NOW = new Date("2026-07-08T20:00:00Z");

function event(overrides: Partial<Event> = {}): Event {
  return {
    slug: "weinberg-show",
    title: "Sample Show",
    description: "A show.",
    starts_at: "2026-07-08T23:00:00Z",
    ends_at: "2026-07-09T01:00:00Z",
    timezone: "America/New_York",
    venue_name: "Weinberg Center for the Arts",
    address: "20 W Patrick St, Frederick, MD",
    geom: { lng: -77.41, lat: 39.41 },
    municipality: "frederick",
    category: "arts",
    audience: ["all"],
    is_free: false,
    price_text: "$28",
    source: "weinberg",
    source_url: "https://weinbergcenter.org/events/sample-show",
    is_verified: false,
    last_verified_at: "2026-07-08T18:00:00Z",
    ...overrides,
  };
}

function markup(events: Event[]) {
  return renderToStaticMarkup(createElement(SavedEventWallet, {
    events,
    now: NOW,
    startRaised: true,
  }));
}

describe("saved event wallet source note", () => {
  it("shows the publisher, the Radius check, and a safe official page link", () => {
    const html = markup([event()]);
    expect(html).toContain("data-event-listing-note");
    expect(html).toContain(
      "This listing comes from Weinberg Center for the Arts. It was checked at the source 2 hours ago.",
    );
    expect(html).toContain('href="https://weinbergcenter.org/events/sample-show"');
    expect(html).toContain("Official event page");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("omits the note when the saved row has no source", () => {
    const html = markup([event({ source: undefined, source_url: "javascript:alert(1)", last_verified_at: undefined })]);
    expect(html).not.toContain("data-event-listing-note");
    expect(html).not.toContain("Official event page");
    expect(html).not.toContain("javascript:");
  });
});
