import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Live/aggregated events used to 404 on /events/[slug]: the explorer
 * cards and Share link to /events/<slug> but the detail route resolved
 * only the static seed. The fix gives each live event a deterministic,
 * URL-safe slug and resolves it back from the feed at request time.
 *
 * Feeds are unreachable from CI/sandbox, so getCachedLiveEvents is stubbed
 * while the real liveEventSlug runs: this verifies the slug the card and
 * Share emit is exactly what the detail route resolves, without a
 * network round trip.
 */
vi.mock("@/lib/integrations/ical-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/ical-live")>();
  return { ...actual, getCachedLiveEvents: vi.fn() };
});
vi.mock("@/lib/integrations/ticketmaster", () => ({
  fetchTicketmasterMusic: vi.fn(async () => []),
  fetchTicketmasterSports: vi.fn(async () => []),
}));
vi.mock("@/lib/integrations/bandsintown", () => ({
  fetchBandsintownForArtists: vi.fn(async () => []),
}));
vi.mock("@/lib/integrations/visitfrederick", () => ({
  fetchVisitFrederick: vi.fn(async () => []),
}));
vi.mock("@/lib/integrations/frederickKeys", () => ({
  fetchFrederickKeys: vi.fn(async () => []),
}));
vi.mock("@/lib/integrations/squarespace-live", () => ({
  fetchSquarespaceVenueEvents: vi.fn(async () => []),
}));
vi.mock("@/lib/loaders/venueEvents", () => ({
  venueEventsAsCards: vi.fn(() => []),
  venueEventsToCards: vi.fn(() => []),
}));
vi.mock("@/lib/integrations/mapboxGeocode", () => ({
  upgradeEventGeom: vi.fn(async (event) => event),
}));
vi.mock("@/lib/loaders/eventThumb", () => ({
  withVenueThumb: vi.fn((event) => event),
}));

import { getCachedLiveEvents, liveEventSlug, type LiveEvent } from "@/lib/integrations/ical-live";
import { liveToCardEvent, getLiveCardEventBySlug, liveCleanSlug } from "@/lib/loaders/liveEvents";

const mockGetCachedLiveEvents = vi.mocked(getCachedLiveEvents);

const sample = (over: Partial<LiveEvent> = {}): LiveEvent => ({
  id: "raw-uid:040000008200E00074C5B7101A82E008",
  title: "First Saturday: Art Walk",
  description: "Galleries open late downtown.",
  starts_at: "2026-05-21T22:00:00Z",
  ends_at: "2026-05-22T01:00:00Z",
  venue_name: "Carroll Creek Amphitheater",
  address: "Carroll Creek, Frederick, MD",
  geom: { lng: -77.4109, lat: 39.4137 },
  municipality: "frederick",
  category: "gallery",
  organizer: "Celebrate Frederick",
  source: "celebrate",
  source_label: "Celebrate Frederick",
  url: "https://www.celebratefrederick.com/event/123",
  is_free: true,
  status: "scheduled",
  last_verified_at: "2026-05-14T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  mockGetCachedLiveEvents.mockReset();
});

describe("liveEventSlug", () => {
  it("is URL-safe and prefixed, never the raw feed UID", () => {
    const slug = liveEventSlug(sample());
    expect(slug).toMatch(/^live-[a-z0-9-]+$/);
    expect(slug).not.toContain(":");
    expect(slug).not.toContain("@");
    expect(slug.startsWith("live-")).toBe(true);
  });

  it("is deterministic for the same event and distinct across start times", () => {
    expect(liveEventSlug(sample())).toBe(liveEventSlug(sample()));
    expect(liveEventSlug(sample())).not.toBe(
      liveEventSlug(sample({ starts_at: "2026-05-28T22:00:00Z" })),
    );
  });
});

describe("liveToCardEvent", () => {
  it("emits the clean stored slug (Phase 2), not the legacy live- form", () => {
    const e = sample();
    const card = liveToCardEvent(e);
    // Clean, dated, shareable slug. 2026-05-21T22:00Z is 6pm ET on the 21st.
    expect(card.slug).toBe(liveCleanSlug(e));
    expect(card.slug).toBe("first-saturday-art-walk-2026-05-21");
    expect(card.slug.startsWith("live-")).toBe(false);
    expect(card.slug).not.toBe(e.id);
    expect(card.source_url).toBe(e.url);
    expect(card.source_id).toBe(e.id);
    // The feed's real source flows through since the provenance work;
    // the old hardcoded "manual" let live rows claim curated trust.
    expect(card.source).toBe("celebrate");
    expect(card.confidence).toBe("verified");
    expect(card.is_recurring).toBe(false);
    expect(card.category_name).toBe("Galleries"); // resolved via CATEGORY_BY_SLUG, fallback-safe
  });
});

describe("getLiveCardEventBySlug", () => {
  it("consults the (cached) feed for an unmatched slug and returns null", async () => {
    // Phase 2 removed the "starts-with-live-" fast path, because a clean
    // live slug now looks like a seed slug. The resolver consults the
    // feed (cached) and returns null when nothing matches.
    mockGetCachedLiveEvents.mockResolvedValue({
      events: [sample()],
      sources_succeeded: ["celebrate"],
      sources_failed: [],
    });
    const result = await getLiveCardEventBySlug("not-a-real-event-2026-01-01");
    expect(result).toBeNull();
    expect(mockGetCachedLiveEvents).toHaveBeenCalled();
  });

  it("still resolves a legacy live- slug as a fallback, returning the clean slug", async () => {
    const e = sample();
    mockGetCachedLiveEvents.mockResolvedValue({
      events: [e],
      sources_succeeded: ["celebrate"],
      sources_failed: [],
    });
    // An old shared link in the legacy format still resolves, and the
    // resolved event carries the CLEAN slug so the detail route can
    // redirect the visitor to the canonical URL.
    const legacy = liveEventSlug(e);
    expect(legacy.startsWith("live-")).toBe(true);
    const resolved = await getLiveCardEventBySlug(legacy);
    expect(resolved).not.toBeNull();
    expect(resolved?.slug).toBe(liveCleanSlug(e));
  });

  it("resolves the exact slug the card and Share emit (the 404 the fix removes)", async () => {
    const e = sample();
    mockGetCachedLiveEvents.mockResolvedValue({
      events: [e],
      sources_succeeded: ["celebrate"],
      sources_failed: [],
    });

    // What EventCard's <Link> and EventActions' Share both build from.
    const sharedSlug = liveToCardEvent(e).slug;
    const resolved = await getLiveCardEventBySlug(sharedSlug);

    expect(mockGetCachedLiveEvents).toHaveBeenCalled();
    expect(resolved).not.toBeNull();
    expect(resolved?.title).toBe(e.title);
    expect(resolved?.slug).toBe(sharedSlug);
    expect(resolved?.source_url).toBe(e.url);
  });

  it("returns null for a slug no longer in the feed window", async () => {
    mockGetCachedLiveEvents.mockResolvedValue({
      events: [sample({ starts_at: "2026-09-01T22:00:00Z" })],
      sources_succeeded: ["celebrate"],
      sources_failed: [],
    });
    const stale = liveToCardEvent(sample()).slug; // different start than the feed event
    expect(await getLiveCardEventBySlug(stale)).toBeNull();
  });
});
