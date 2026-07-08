import { describe, expect, it } from "vitest";
import { eventLipFact, eventPriceLabel, eventWhenParts } from "@/components/saved/eventWalletFacts";
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
