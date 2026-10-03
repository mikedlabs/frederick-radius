import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "./events";
import { prepareEventArchiveRows } from "@/lib/events/event-archive-batch";
import {
  compactUnifiedEvents,
  assembleUnifiedEvents,
  hydrateUnifiedEvents,
  mergeUnifiedEventCards,
  withAbortableTimeout,
  type UnifiedEvents,
} from "./unifiedEvents";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function event(
  title: string,
  category = "music",
): EventWithMeta {
  return {
    slug: title.toLowerCase().replaceAll(" ", "-"),
    title,
    description: "A posted event.",
    starts_at: "2026-07-21T23:00:00.000Z",
    ends_at: "2026-07-22T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Test Venue",
    address: "1 Market Street, Frederick, MD 21701",
    geom: { lng: -77.4109, lat: 39.4143 },
    municipality: "frederick",
    category,
    audience: [],
    is_free: true,
    source: "manual",
    is_verified: true,
    feature_score: 5,
    municipality_name: "Frederick",
    category_name: category,
  } as unknown as EventWithMeta;
}

describe("unified event cache payload", () => {
  it("stores the event corpus once and rebuilds the public subset", () => {
    const publicEvent = event("Summer Concert");
    const civicEvent = event("Planning Commission Meeting", "civic");
    const result: UnifiedEvents = {
      unified: [publicEvent, civicEvent],
      publicEvents: [publicEvent],
      sourceHealth: { degraded: false, unavailable: [] },
    };

    const compact = compactUnifiedEvents(result);
    expect(compact).not.toHaveProperty("publicEvents");
    expect(compact.unified).toHaveLength(2);

    const hydrated = hydrateUnifiedEvents(compact);
    expect(hydrated.unified).toEqual(result.unified);
    expect(hydrated.publicEvents.map((item) => item.slug)).toEqual([
      publicEvent.slug,
    ]);
  });

  it("does not duplicate large event descriptions in serialized cache data", () => {
    const large = {
      ...event("Large Feed Event"),
      description: "x".repeat(100_000),
    };
    const result: UnifiedEvents = {
      unified: [large],
      publicEvents: [large],
      sourceHealth: { degraded: false, unavailable: [] },
    };

    const fullBytes = JSON.stringify(result).length;
    const compactBytes = JSON.stringify(compactUnifiedEvents(result)).length;
    expect(compactBytes).toBeLessThan(fullBytes * 0.55);
  });
});

describe("abortable event source deadlines", () => {
  it("aborts underlying work before returning the timeout fallback", async () => {
    vi.useFakeTimers();
    let sourceSignal: AbortSignal | undefined;

    const result = withAbortableTimeout(
      (signal) => {
        sourceSignal = signal;
        return new Promise<string>(() => undefined);
      },
      8_000,
      "fallback",
    );

    await vi.advanceTimersByTimeAsync(8_000);

    await expect(result).resolves.toBe("fallback");
    expect(sourceSignal?.aborted).toBe(true);
  });

  it("does not abort work that finishes before the deadline", async () => {
    vi.useFakeTimers();
    let sourceSignal: AbortSignal | undefined;

    const result = withAbortableTimeout(
      async (signal) => {
        sourceSignal = signal;
        return "events";
      },
      8_000,
      "fallback",
    );

    await expect(result).resolves.toBe("events");
    expect(sourceSignal?.aborted).toBe(false);
  });
});

describe("promoted event release", () => {
  it("assembles committed events without contacting a publisher", async () => {
    vi.stubEnv("RADIUS_DATA_MODE", "promoted");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await assembleUnifiedEvents(new Date());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.sourceHealth).toEqual({
      degraded: true,
      unavailable: ["live event refresh (runtime only)"],
    });
    expect(result.publicEvents.every((item) => item.source !== "ticketmaster")).toBe(true);
  });
});


describe("FCPL lifecycle delivery through the shared assembly", () => {
  const lifecycle = (overrides: Partial<EventWithMeta> = {}): EventWithMeta => ({
    ...event("Library Program"),
    slug: "library-program-fcpl-20261013",
    source: "fcpl", source_id: "215491", is_verified: false,
    source_url: "https://frederick.librarycalendar.com/event/drop-health-program-215491",
    last_verified_at: "2026-10-03T01:00:00Z",
    starts_at: "2026-10-13T14:00:00Z", ends_at: "2026-10-13T17:00:00Z",
    status: "cancelled", geo_confidence: "exact_address", ...overrides,
  });
  const shared = (curated: EventWithMeta[], ingested: EventWithMeta[]) => hydrateUnifiedEvents({
    unified: mergeUnifiedEventCards(curated, [], [], ingested),
    sourceHealth: { degraded: false, unavailable: [] },
  });

  it("retains an FCPL lifecycle identity even when a richer curated card matches its title and time", () => {
    const cancelled = lifecycle();
    const curated = { ...cancelled, slug: "reviewed-library-program", source: "manual" as const,
      source_id: "curated-1", source_url: "https://example.com/program", is_verified: true, status: "scheduled" as const };
    const result = shared([curated], [cancelled]);
    expect(result.publicEvents).toEqual([curated]);
    expect(prepareEventArchiveRows(result.unified).rows).toContainEqual(expect.objectContaining({ source: "fcpl", source_uid: "215491", event_status: "cancelled" }));
  });

  it.each([
    { title: "Library Hall", venue_name: "Library Hall" },
    { title: "Facility Reservation" },
  ])("retains lifecycle rows that fail public feed sanity: %j", (overrides) => {
    const cancelled = lifecycle(overrides);
    const result = shared([], [cancelled]);
    expect(result.publicEvents).toEqual([]);
    expect(prepareEventArchiveRows(result.unified).rows).toHaveLength(1);
    expect(result.unified[0].source_id).toBe("215491");
  });

  it("does not let a slug collision erase the source identity the archive needs", () => {
    const cancelled = lifecycle();
    const curated = { ...cancelled, source: "manual" as const, source_id: "other-source",
      source_url: "https://example.com/another-program", is_verified: true, status: "scheduled" as const };
    const result = shared([curated], [cancelled]);
    expect(result.publicEvents).toEqual([curated]);
    expect(result.unified.map((row) => row.source_id)).toContain("215491");
  });

  it("suppresses the stale scheduled copy of the exact official occurrence but preserves another date", () => {
    const cancelled = lifecycle();
    const stale = { ...cancelled, is_verified: true, status: "scheduled" as const };
    const sibling = { ...stale, slug: "library-program-fcpl-20261020", source_id: "215492",
      source_url: "https://frederick.librarycalendar.com/event/drop-health-program-215492",
      starts_at: "2026-10-20T14:00:00Z", ends_at: "2026-10-20T17:00:00Z" };
    const result = shared([stale, sibling], [cancelled]);
    expect(result.publicEvents.map((row) => row.source_id)).toEqual(["215492"]);
    expect(prepareEventArchiveRows(result.unified).rows.find((row) => row.source_uid === "215491")?.event_status).toBe("cancelled");
  });

  it("matches an official occurrence URL only for the same start time", () => {
    const cancelled = lifecycle();
    const stale = { ...cancelled, source: "manual" as const, source_id: "curated-copy",
      slug: "curated-copy", is_verified: true, status: "scheduled" as const };
    const otherDate = { ...stale, slug: "curated-next-week", source_id: "curated-next-week", starts_at: "2026-10-20T14:00:00Z", ends_at: "2026-10-20T17:00:00Z" };
    const result = shared([stale, otherDate], [cancelled]);
    expect(result.publicEvents.map((row) => row.slug)).toEqual(["curated-next-week"]);
    expect(result.unified).toContainEqual(cancelled);
  });

  // This event path is present in the official feed without a numeric suffix.
  it.each([
    "https://frederick.librarycalendar.com/event/UnderstandingAlzheimers",
    "https://frederick.librarycalendar.com/event/UnderstandingAlzheimers/?source=calendar#details",
  ])("matches a real official event path without a numeric suffix: %s", (sourceUrl) => {
    const cancelled = lifecycle({ source_url: sourceUrl });
    const stale = { ...cancelled, source: "manual" as const, source_id: "curated-copy",
      slug: "curated-copy", is_verified: true, status: "scheduled" as const };
    const otherDate = { ...stale, slug: "curated-next-week", source_id: "curated-next-week",
      starts_at: "2026-10-20T14:00:00Z", ends_at: "2026-10-20T17:00:00Z" };
    const result = shared([stale, otherDate], [cancelled]);
    expect(result.publicEvents).toEqual([otherDate]);
    expect(result.unified).toContainEqual(cancelled);
  });

  it.each([
    "https://frederick.librarycalendar.com/",
    "https://frederick.librarycalendar.com/events/feed/json",
    "https://frederick.librarycalendar.com/event/",
    "https://frederick.librarycalendar.com/event/program/another-page",
    "http://frederick.librarycalendar.com/event/UnderstandingAlzheimers",
    "https://example.com/event/UnderstandingAlzheimers",
  ])("does not match a shared non-occurrence or unofficial URL: %s", (sourceUrl) => {
    const cancelled = lifecycle({ source_url: sourceUrl });
    const current = { ...cancelled, source: "manual" as const, source_id: "other",
      slug: "another-program", status: "scheduled" as const, is_verified: true };
    expect(shared([current], [cancelled]).publicEvents).toEqual([current]);
  });

  it("does not cancel a same-title program with another FCPL UID or an unrelated source", () => {
    const cancelled = lifecycle();
    const otherLibraryProgram = { ...cancelled, source_id: "different-fcpl-uid", slug: "other-library-program",
      source_url: "https://frederick.librarycalendar.com/event/other-program-123456", status: "scheduled" as const, is_verified: true };
    const unrelated = { ...cancelled, source: "manual" as const, slug: "unrelated-program",
      source_url: "https://example.com/unrelated", status: "scheduled" as const, is_verified: true };
    expect(shared([otherLibraryProgram], [cancelled]).publicEvents).toEqual([otherLibraryProgram]);
    expect(shared([unrelated], [cancelled]).publicEvents).toEqual([unrelated]);
  });

  it.each([undefined, " "])("never treats missing or blank source IDs as a shared identity: %s", (sourceId) => {
    const cancelled = lifecycle({ source_id: sourceId, source_url: undefined });
    const current = { ...cancelled, slug: "unidentified-program", status: "scheduled" as const, is_verified: true };
    expect(shared([current], [cancelled]).publicEvents).toEqual([current]);
  });

});
