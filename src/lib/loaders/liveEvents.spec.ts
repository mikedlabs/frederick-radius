import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { LiveEvent } from "@/lib/integrations/ical-live";
import type { VenueEvent } from "@/lib/loaders/venueEvents";

const mocks = vi.hoisted(() => ({
  getCachedLiveEvents: vi.fn(),
  liveEventSlug: vi.fn((event: { id: string }) => `live-${event.id}`),
  fetchTicketmasterSports: vi.fn(),
  fetchBandsintownForArtists: vi.fn(),
  fetchVisitFrederick: vi.fn(),
  fetchFrederickKeys: vi.fn(),
  fetchSquarespaceVenueEvents: vi.fn(),
  venueEventsAsCards: vi.fn(),
  venueEventsToCards: vi.fn(),
  withVenueThumb: vi.fn((event: EventWithMeta) => event),
  upgradeEventGeom: vi.fn(async (event: EventWithMeta) => event),
}));

vi.mock("@/lib/integrations/ical-live", () => ({
  getCachedLiveEvents: mocks.getCachedLiveEvents,
  liveEventSlug: mocks.liveEventSlug,
}));
vi.mock("@/lib/integrations/ticketmaster", () => ({
  fetchTicketmasterSports: mocks.fetchTicketmasterSports,
}));
vi.mock("@/lib/integrations/bandsintown", () => ({
  fetchBandsintownForArtists: mocks.fetchBandsintownForArtists,
}));
vi.mock("@/lib/integrations/visitfrederick", () => ({
  fetchVisitFrederick: mocks.fetchVisitFrederick,
}));
vi.mock("@/lib/integrations/frederickKeys", () => ({
  fetchFrederickKeys: mocks.fetchFrederickKeys,
}));
vi.mock("@/lib/integrations/squarespace-live", () => ({
  fetchSquarespaceVenueEvents: mocks.fetchSquarespaceVenueEvents,
}));
vi.mock("@/lib/loaders/venueEvents", () => ({
  venueEventsAsCards: mocks.venueEventsAsCards,
  venueEventsToCards: mocks.venueEventsToCards,
}));
vi.mock("@/lib/loaders/eventThumb", () => ({
  withVenueThumb: mocks.withVenueThumb,
}));
vi.mock("@/lib/integrations/mapboxGeocode", () => ({
  upgradeEventGeom: mocks.upgradeEventGeom,
}));

import {
  getLiveCardEventBySlug,
  liveCleanSlug,
  LiveEventLookupIncompleteError,
} from "./liveEvents";

function card(slug: string): EventWithMeta {
  return {
    slug,
    title: "Local venue event",
    description: "",
    starts_at: "2026-07-30T22:00:00.000Z",
    ends_at: "2026-07-31T00:00:00.000Z",
    timezone: "America/New_York",
    is_all_day: false,
    is_recurring: false,
    venue_name: "Test venue",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    status: "scheduled",
    source: "venue-extract",
    is_verified: false,
    source_id: slug,
    source_url: "https://example.com/event",
    license: "Publisher event page",
    first_seen_at: "2026-07-29T12:00:00.000Z",
    last_verified_at: "2026-07-29T12:00:00.000Z",
    confidence: "scraped",
    geo_confidence: "exact_address",
    category_name: "Community",
    municipality_name: "Frederick",
  };
}

function liveEvent(id: string, title: string): LiveEvent {
  return {
    id,
    title,
    description: "A live event.",
    starts_at: "2026-07-30T22:00:00.000Z",
    ends_at: "2026-07-31T00:00:00.000Z",
    venue_name: "Test venue",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    organizer: "Test organizer",
    source: "celebrate",
    source_label: "Celebrate Frederick",
    url: `https://example.com/${id}`,
    is_free: true,
    status: "scheduled",
    last_verified_at: "2026-07-29T12:00:00.000Z",
  };
}

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("getLiveCardEventBySlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.venueEventsAsCards.mockReturnValue([]);
    mocks.venueEventsToCards.mockReturnValue([]);
    mocks.getCachedLiveEvents.mockResolvedValue({ events: [] });
    mocks.fetchTicketmasterSports.mockResolvedValue([]);
    mocks.fetchBandsintownForArtists.mockResolvedValue([]);
    mocks.fetchVisitFrederick.mockResolvedValue([]);
    mocks.fetchFrederickKeys.mockResolvedValue([]);
    mocks.fetchSquarespaceVenueEvents.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves a committed venue card without starting any provider", async () => {
    const local = card("local-show-2026-07-30");
    mocks.venueEventsAsCards.mockReturnValue([local]);

    await expect(getLiveCardEventBySlug(local.slug)).resolves.toEqual(local);

    expect(mocks.getCachedLiveEvents).not.toHaveBeenCalled();
    expect(mocks.fetchTicketmasterSports).not.toHaveBeenCalled();
    expect(mocks.fetchBandsintownForArtists).not.toHaveBeenCalled();
    expect(mocks.fetchVisitFrederick).not.toHaveBeenCalled();
    expect(mocks.fetchFrederickKeys).not.toHaveBeenCalled();
    expect(mocks.fetchSquarespaceVenueEvents).not.toHaveBeenCalled();
  });

  it("returns a fast provider hit without waiting for a never-settling source", async () => {
    const fast = liveEvent("fast", "Fast Match");
    const slug = liveCleanSlug(fast);
    const controller = new AbortController();
    mocks.getCachedLiveEvents.mockResolvedValue({ events: [fast] });
    mocks.fetchTicketmasterSports.mockImplementation(() => never());

    const pending = getLiveCardEventBySlug(slug, 90, {
      signal: controller.signal,
      deadline: Date.now() + 1_000,
    });
    const tooSlow = Symbol("too slow");
    let result: EventWithMeta | null | typeof tooSlow;
    try {
      result = await Promise.race([
        pending,
        new Promise<typeof tooSlow>((resolve) =>
          setTimeout(() => resolve(tooSlow), 50),
        ),
      ]);
    } finally {
      controller.abort();
      await pending.catch(() => null);
    }

    expect(result).not.toBe(tooSlow);
    expect(result).toMatchObject({ slug, title: "Fast Match" });
  });

  it("returns null only after every provider supplies a definitive miss", async () => {
    await expect(
      getLiveCardEventBySlug("not-in-any-source"),
    ).resolves.toBeNull();

    expect(mocks.getCachedLiveEvents).toHaveBeenCalledOnce();
    expect(mocks.fetchTicketmasterSports).toHaveBeenCalledOnce();
    expect(mocks.fetchBandsintownForArtists).toHaveBeenCalledOnce();
    expect(mocks.fetchVisitFrederick).toHaveBeenCalledOnce();
    expect(mocks.fetchFrederickKeys).toHaveBeenCalledOnce();
    expect(mocks.fetchSquarespaceVenueEvents).toHaveBeenCalledOnce();
  });

  it("reports an unfinished provider as incomplete instead of a false miss", async () => {
    vi.useFakeTimers();
    mocks.fetchTicketmasterSports.mockImplementation(() => never());

    const pending = getLiveCardEventBySlug("possibly-slow-event", 90, {
      deadline: Date.now() + 100,
    });
    const rejection = expect(pending).rejects.toBeInstanceOf(
      LiveEventLookupIncompleteError,
    );
    await vi.advanceTimersByTimeAsync(100);

    await rejection;
  });

  it("aborts unfinished work and ignores a losing provider that settles late", async () => {
    const late = deferred<VenueEvent[]>();
    const controller = new AbortController();
    mocks.fetchSquarespaceVenueEvents.mockReturnValue(late.promise);

    const pending = getLiveCardEventBySlug("possibly-late-event", 90, {
      signal: controller.signal,
      deadline: Date.now() + 1_000,
    });
    await Promise.resolve();
    expect(mocks.fetchSquarespaceVenueEvents).toHaveBeenCalledOnce();

    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(
      LiveEventLookupIncompleteError,
    );

    late.resolve([
      {
        title: "Late event",
        starts_at: "2026-07-30T22:00:00.000Z",
        venue_slug: "test-venue",
        venue_name: "Test venue",
        source: {
          url: "https://example.com/late",
          fetchedAt: "2026-07-29T12:00:00.000Z",
        },
      },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.venueEventsToCards).not.toHaveBeenCalled();
  });
});
