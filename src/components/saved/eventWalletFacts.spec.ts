import { describe, expect, it } from "vitest";
import {
  eventCheckedPhrase,
  eventLipFact,
  eventListingNote,
  eventPriceLabel,
  eventPublisherUrl,
  eventWhenParts,
} from "@/components/saved/eventWalletFacts";
import type { Event } from "@/data/events";

/** A minimal, valid Event for the pure fact helpers. Times are UTC ISO; the
 *  helpers render them in America/New_York (July => EDT = UTC-4). */
function mk(overrides: Partial<Event> = {}): Event {
  return {
    slug: "sample-show",
    title: "Sample Show",
    description: "A show.",
    starts_at: "2026-07-08T23:00:00Z", // Wed Jul 8, 7:00 PM EDT
    ends_at: "2026-07-09T01:00:00Z",
    timezone: "America/New_York",
    venue_name: "Carroll Creek Amphitheater",
    address: "1 Creek Way, Frederick, MD",
    geom: { lng: -77.41, lat: 39.41 },
    municipality: "frederick",
    category: "music",
    audience: ["all"],
    is_free: false,
    source: "seed",
    is_verified: true,
    ...overrides,
  };
}

// 4:00 PM EDT on Wed Jul 8, 2026 — the page's "now".
const NOW = new Date("2026-07-08T20:00:00Z");

describe("eventLipFact: one fact, chosen by value", () => {
  it("a live event wins and carries the live dot", () => {
    // Started 3 PM EDT, ends 6 PM EDT — live at 4 PM.
    const live = mk({ starts_at: "2026-07-08T19:00:00Z", ends_at: "2026-07-08T22:00:00Z" });
    expect(eventLipFact(live, NOW)).toEqual({ text: "On now", live: true, dim: false });
  });
  it("an upcoming event TODAY reads salient (not dimmed), no live claim", () => {
    expect(eventLipFact(mk(), NOW)).toEqual({ text: "Wed JUL 8", live: false, dim: false });
  });
  it("a later event dims so today/live cards win the scan", () => {
    // Sun Jul 12, 6 PM EDT.
    const later = mk({ starts_at: "2026-07-12T22:00:00Z", ends_at: "2026-07-13T00:00:00Z" });
    expect(eventLipFact(later, NOW)).toEqual({ text: "Sun JUL 12", live: false, dim: true });
  });
  it("an all-day event never claims live", () => {
    const allDay = mk({ is_all_day: true, starts_at: "2026-07-08T04:00:00Z", ends_at: "2026-07-09T03:59:00Z" });
    expect(eventLipFact(allDay, NOW).live).toBe(false);
  });
});

describe("eventWhenParts: title-cased date + honest clock", () => {
  it("splits a timed event into date and clock", () => {
    expect(eventWhenParts(mk())).toEqual({ date: "Wed, Jul 8", time: "7:00 PM" });
  });
  it("carries All day for all-day rows, never a bogus midnight clock", () => {
    const allDay = mk({ is_all_day: true, starts_at: "2026-07-08T04:00:00Z", ends_at: "2026-07-09T03:59:00Z" });
    expect(eventWhenParts(allDay)).toEqual({ date: "Wed, Jul 8", time: "All day" });
  });
});

describe("eventListingNote: publisher and check time, only when the record has them", () => {
  it("names a publisher and a recent Radius check", () => {
    expect(eventListingNote({
      source: "weinberg",
      source_url: "https://weinbergcenter.org/events/show",
      last_verified_at: "2026-07-08T18:00:00Z",
    }, NOW)).toEqual({
      sentence: "This listing comes from Weinberg Center for the Arts. It was checked at the source 2 hours ago.",
      sourceUrl: "https://weinbergcenter.org/events/show",
    });
  });

  it("uses the venue name for a venue-page extract", () => {
    expect(eventListingNote({
      source: "venue-extract",
      organizer: "  Monocacy   Brewing ",
      last_verified_at: "2026-07-08T19:30:00Z",
    }, NOW)?.sentence).toBe(
      "This listing comes from Monocacy Brewing. It was checked at the source 30 minutes ago.",
    );
  });

  it("falls back to the venue page when an extract has no organizer", () => {
    expect(eventListingNote({ source: "venue-extract" }, NOW)?.sentence).toBe(
      "This listing comes from the venue's own page.",
    );
  });

  it("dates a check once it is older than two weeks", () => {
    expect(eventListingNote({
      source: "county",
      last_verified_at: "2026-06-18T16:00:00Z",
    }, NOW)?.sentence).toBe(
      "This listing comes from Frederick County Government. It was last checked at the source on Jun 18, 2026.",
    );
  });

  it("does not invent a check time, and drops an unsafe publisher URL", () => {
    expect(eventListingNote({
      source: "ticketmaster",
      source_url: "javascript:alert(1)",
    }, NOW)).toEqual({
      sentence: "This listing comes from Ticketmaster.",
      sourceUrl: null,
    });
    expect(eventPublisherUrl("not a url")).toBeNull();
    expect(eventCheckedPhrase("2026-07-08T21:00:00Z", NOW)).toBeNull();
    expect(eventCheckedPhrase("not-a-date", NOW)).toBeNull();
  });

  it("distinguishes a Radius-selected listing from an unchecked manual row", () => {
    expect(eventListingNote({ source: "seed" }, NOW)?.sentence).toBe(
      "Frederick Radius selected this listing.",
    );
    expect(eventListingNote({
      source: "manual",
      is_verified: true,
      last_verified_at: "2026-07-08T19:59:30Z",
    }, NOW)?.sentence).toBe(
      "Frederick Radius checked this listing against its source just now.",
    );
    expect(eventListingNote({ source: "manual", is_verified: false }, NOW)?.sentence).toBe(
      "Frederick Radius has this listing on file.",
    );
  });

  it("says nothing when the source is missing or unknown", () => {
    expect(eventListingNote({}, NOW)).toBeNull();
    expect(eventListingNote({ source: "not-a-feed" }, NOW)).toBeNull();
  });

  it("keeps a one-day check in the relative voice", () => {
    expect(eventCheckedPhrase("2026-07-07T20:00:00Z", NOW)).toEqual({
      stale: false,
      relative: "1 day ago",
      date: "Jul 7, 2026",
    });
  });
});

describe("eventPriceLabel: honest admission, never invented", () => {
  it("prints Free only when the event is flagged free", () => {
    expect(eventPriceLabel(mk({ is_free: true }))).toBe("Free");
  });
  it("prints the shipped price_text for a paid event", () => {
    expect(eventPriceLabel(mk({ is_free: false, price_text: "$5 admission · 21+" }))).toBe("$5 admission · 21+");
  });
  it("returns null (an honest dash downstream) when price is unknown", () => {
    expect(eventPriceLabel(mk({ is_free: false, price_text: undefined }))).toBeNull();
    expect(eventPriceLabel(mk({ is_free: false, price_text: "   " }))).toBeNull();
  });
});
