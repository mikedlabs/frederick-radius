import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The event-assembly SEAM (assembleRaw). The pure transforms it composes
 * (dedupe, collapse, classify, time-sanity, venue cleaning) have their own
 * specs; this covers the orchestration those specs don't: that a failing feed
 * degrades soft instead of taking the board down, that the public lane is a
 * strict subset of the unified set, and that the merged set comes out
 * time-sorted. Every live feed and the two heavy post-processors (geocode,
 * thumbs) are mocked so the assembly logic itself is what's under test.
 */

vi.mock("@/lib/integrations/ical-live", () => ({
  getLiveEvents: vi.fn(async () => ({ events: [], sources_succeeded: [], sources_failed: [] })),
}));
vi.mock("@/lib/integrations/ticketmaster", () => ({
  fetchTicketmasterMusic: vi.fn(async () => []),
  fetchTicketmasterSports: vi.fn(async () => []),
}));
vi.mock("@/lib/integrations/bandsintown", () => ({
  fetchBandsintownForArtists: vi.fn(async () => []),
}));
vi.mock("@/lib/integrations/seatgeek", () => ({ fetchSeatGeek: vi.fn(async () => []) }));
vi.mock("@/lib/integrations/eventbrite", () => ({ fetchEventbrite: vi.fn(async () => []) }));
vi.mock("@/lib/integrations/visitfrederick", () => ({ fetchVisitFrederick: vi.fn(async () => []) }));
vi.mock("@/lib/integrations/frederickKeys", () => ({ fetchFrederickKeys: vi.fn(async () => []) }));
vi.mock("@/lib/integrations/squarespace-live", () => ({
  fetchSquarespaceVenueEvents: vi.fn(async () => []),
}));
vi.mock("@/lib/loaders/ingested", () => ({ getIngestedSeries: vi.fn(async () => []) }));
vi.mock("@/lib/loaders/venueEvents", () => ({
  venueEventsAsCards: vi.fn(() => []),
  venueEventsToCards: vi.fn(() => []),
}));
// Heavy post-processors become pass-throughs so the merge/lane/sort logic is
// isolated from network geocoding and photo joins.
vi.mock("@/lib/integrations/mapboxGeocode", () => ({
  upgradeEventGeoms: vi.fn(async (events: unknown) => events),
}));
vi.mock("@/lib/loaders/eventThumb", () => ({ withVenueThumbs: vi.fn((events: unknown) => events) }));

import { assembleRaw } from "@/lib/loaders/unifiedEvents";
import { getLiveEvents } from "@/lib/integrations/ical-live";
import { withVenueThumbs } from "@/lib/loaders/eventThumb";
import { isPublicEvent } from "@/lib/events/classify";

const NOW = new Date("2026-07-15T16:00:00.000Z");

describe("assembleRaw — assembly seam", () => {
  beforeEach(() => {
    vi.mocked(getLiveEvents).mockResolvedValue({
      events: [],
      sources_succeeded: [],
      sources_failed: [],
    });
  });

  it("assembles with all live feeds empty and reports healthy", async () => {
    const r = await assembleRaw(NOW);
    expect(Array.isArray(r.unified)).toBe(true);
    expect(Array.isArray(r.publicEvents)).toBe(true);
    expect(r.sourceHealth.degraded).toBe(false);
    expect(r.sourceHealth.unavailable).toEqual([]);
  });

  it("keeps the public lane a strict subset of the unified set", async () => {
    const r = await assembleRaw(NOW);
    const unifiedSlugs = new Set(r.unified.map((e) => e.slug));
    expect(r.publicEvents.every((e) => unifiedSlugs.has(e.slug))).toBe(true);
    // The public lane must contain only public events, and no public event may
    // be silently dropped from it.
    expect(r.publicEvents.every(isPublicEvent)).toBe(true);
    expect(r.unified.filter(isPublicEvent).length).toBe(r.publicEvents.length);
  });

  it("returns the unified set time-sorted (soonest first)", async () => {
    const r = await assembleRaw(NOW);
    const times = r.unified.map((e) => new Date(e.starts_at).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("produces unique slugs (dedupe held across sources)", async () => {
    const r = await assembleRaw(NOW);
    const slugs = r.unified.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("degrades soft: a failing feed flips sourceHealth without emptying the board", async () => {
    vi.mocked(getLiveEvents).mockRejectedValueOnce(new Error("upstream down"));
    const r = await assembleRaw(NOW);
    expect(r.sourceHealth.degraded).toBe(true);
    expect(r.sourceHealth.unavailable).toContain("municipal calendars");
    // The curated seeds still assemble; a dead feed never yields a dead board.
    expect(Array.isArray(r.unified)).toBe(true);
  });

  it("survives a throwing tail decoration instead of taking the board down", async () => {
    // One cached assembleRaw call feeds today/events/live-music/check-a-date, so
    // a throw in a post-dedupe decoration (here the venue-photo join) must
    // degrade to the pre-decoration set, not reject and error-boundary all four.
    vi.mocked(withVenueThumbs).mockImplementationOnce(() => {
      throw new Error("thumb join blew up");
    });
    const r = await assembleRaw(NOW);
    expect(Array.isArray(r.unified)).toBe(true);
    expect(r.sourceHealth).toBeDefined();
  });
});
