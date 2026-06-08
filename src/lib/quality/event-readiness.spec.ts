import { describe, it, expect } from "vitest";
import { eventTier } from "@/lib/quality/event-readiness";
import type { Event } from "@/data/events";

const now = new Date("2026-06-08T12:00:00Z");

// A future, precise, curated base event (Tier-1 eligible).
const base = (o: Partial<Event> = {}): Event =>
  ({
    slug: "e",
    title: "Test Event",
    starts_at: "2026-06-20T23:00:00Z",
    ends_at: "2026-06-21T02:00:00Z",
    venue_name: "Carroll Creek Amphitheater",
    municipality: "frederick",
    category: "music",
    source: "manual",
    placement: "venue",
    geom: { lng: -77.3985, lat: 39.4235 },
    is_free: true,
    ...o,
  }) as Event;

const t = (o: Partial<Event> = {}) => eventTier(base(o), now).tier;

describe("eventTier", () => {
  it("Tier 4 — a past event is archived", () => {
    expect(t({ starts_at: "2026-05-01T18:00:00Z", ends_at: "2026-05-01T20:00:00Z", is_recurring: false })).toBe(4);
  });

  it("Tier 4 — a cancelled event is archived even if upcoming", () => {
    expect(t({ status: "cancelled" })).toBe(4);
  });

  it("Tier 4 — an undated event is archived", () => {
    expect(t({ starts_at: "not-a-date" })).toBe(4);
  });

  it("Tier 3 — an upcoming event with no venue needs review", () => {
    expect(t({ venue_name: "" })).toBe(3);
  });

  it("Tier 3 — a non-curated event with no source URL needs review", () => {
    expect(t({ source: "dfp", source_url: undefined })).toBe(3);
  });

  it("Tier 3 — an event with no town needs review", () => {
    expect(t({ municipality: "" })).toBe(3);
  });

  it("Tier 1 — a precise, sourced, upcoming event is recommendable", () => {
    expect(t({ source: "manual" })).toBe(1);
    expect(t({ source: "dfp", source_url: "https://example.com/e" })).toBe(1);
  });

  it("a recurring event with a past anchor is not archived as past", () => {
    expect(t({ is_recurring: true, recurrence_text: "Every Thursday", starts_at: "2026-05-07T23:00:00Z", ends_at: "2026-05-08T01:00:00Z" })).not.toBe(4);
  });
});
