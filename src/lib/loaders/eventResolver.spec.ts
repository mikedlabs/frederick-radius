import { describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import {
  EVENT_DEEP_LINK_TIMEOUT_MS,
  EventResolutionTimeoutError,
  EventResolutionUnavailableError,
  resolveEventPageBySlugWithSources,
} from "./eventResolver";

function event(slug: string): EventWithMeta {
  return {
    slug,
    title: slug,
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
    source: "celebrate",
    is_verified: false,
    source_id: "publisher-uid-123",
    source_url: "https://example.com/event",
    license: "Partner feed terms",
    first_seen_at: "2026-07-23T12:00:00.000Z",
    last_verified_at: "2026-07-23T12:00:00.000Z",
    confidence: "partner",
    geo_confidence: "exact_address",
    category_name: "Community",
    municipality_name: "Frederick",
  };
}

function sources(
  overrides: Partial<
    Parameters<typeof resolveEventPageBySlugWithSources>[2]
  > = {},
) {
  return {
    seed: vi.fn(() => null),
    archive: vi.fn(async () => null),
    live: vi.fn(async () => null),
    ingested: vi.fn(async () => null),
    persist: vi.fn(async (value: EventWithMeta) => ({
      id: "event-id",
      canonicalSlug: value.slug,
      snapshot: value,
    })),
    ...overrides,
  };
}

describe("resolveEventPageBySlugWithSources", () => {
  it("resolves the exact incident URL from the durable archive without rebuilding event feeds", async () => {
    const retained = event("game-time-urbana-2026-07-27");
    const loaders = sources({
      archive: vi.fn(async () => ({
        id: "identity-1",
        canonicalSlug: retained.slug,
        event: retained,
        tombstoned: true,
        lastSeenAt: "2026-07-27T18:00:00.000Z",
      })),
    });

    await expect(
      resolveEventPageBySlugWithSources(
        retained.slug,
        new Date("2026-07-28T16:00:00.000Z"),
        loaders,
      ),
    ).resolves.toEqual({ event: retained, kind: "archive" });
    expect(loaders.live).not.toHaveBeenCalled();
    expect(loaders.ingested).not.toHaveBeenCalled();
  });

  it("resolves an old slug alias to the current canonical snapshot", async () => {
    const canonical = event("first-saturday-art-walk-2026-07-30");
    const loaders = sources({
      archive: vi.fn(async () => ({
        id: "identity-2",
        canonicalSlug: canonical.slug,
        event: canonical,
        tombstoned: false,
        lastSeenAt: "2026-07-29T12:00:00.000Z",
      })),
    });

    await expect(
      resolveEventPageBySlugWithSources(
        "live-first-saturday-art-walk-legacy",
        new Date(),
        loaders,
      ),
    ).resolves.toEqual({ event: canonical, kind: "archive" });
  });

  it("returns curated events without paying for database or network sources", async () => {
    const curated = event("curated-event");
    const loaders = sources({ seed: vi.fn(() => curated) });

    await expect(
      resolveEventPageBySlugWithSources(curated.slug, new Date(), loaders),
    ).resolves.toEqual({ event: curated, kind: "seed" });
    expect(loaders.archive).not.toHaveBeenCalled();
    expect(loaders.live).not.toHaveBeenCalled();
    expect(loaders.ingested).not.toHaveBeenCalled();
  });

  it("persists a publisher UID and requested alias after a direct live hit", async () => {
    const current = event("new-title-2026-07-30");
    const persist = vi.fn(async (value: EventWithMeta) => ({
      id: "identity-3",
      canonicalSlug: value.slug,
      snapshot: value,
    }));
    const loaders = sources({
      live: vi.fn(async () => current),
      persist,
    });

    await expect(
      resolveEventPageBySlugWithSources(
        "old-title-2026-07-30",
        new Date(),
        loaders,
      ),
    ).resolves.toEqual({ event: current, kind: "live" });
    expect(persist).toHaveBeenCalledWith(current, [
      "old-title-2026-07-30",
      current.slug,
    ]);
    expect(current.source_id).toBe("publisher-uid-123");
  });

  it("aborts the losing source when the first usable event wins", async () => {
    let losingSignal: AbortSignal | undefined;
    const winner = event("alive-at-five-2026-07-30");
    const loaders = sources({
      live: vi.fn(async () => winner),
      ingested: vi.fn((_slug, context) => {
        losingSignal = context.signal;
        return new Promise<EventWithMeta | null>(() => undefined);
      }),
    });

    await expect(
      resolveEventPageBySlugWithSources(winner.slug, new Date(), loaders),
    ).resolves.toEqual({ event: winner, kind: "live" });
    expect(losingSignal?.aborted).toBe(true);
  });

  it("does not turn an incomplete source lookup into a false 404", async () => {
    vi.useFakeTimers();
    try {
      const loaders = sources({
        live: vi.fn(
          () => new Promise<EventWithMeta | null>(() => undefined),
        ),
      });
      const pending = resolveEventPageBySlugWithSources(
        "game-time-urbana-2026-07-27",
        new Date("2026-07-28T16:00:00.000Z"),
        loaders,
      );
      const rejection = expect(pending).rejects.toMatchObject({
        name: "EventResolutionTimeoutError",
        sources: ["live"],
      } satisfies Partial<EventResolutionTimeoutError>);
      await vi.advanceTimersByTimeAsync(EVENT_DEEP_LINK_TIMEOUT_MS);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("reserves null for a definitive miss from the archive and both source readers", async () => {
    const loaders = sources();
    await expect(
      resolveEventPageBySlugWithSources("missing-event", new Date(), loaders),
    ).resolves.toBeNull();
  });

  it("does not turn a failed provider read into a definitive miss", async () => {
    const loaders = sources({
      live: vi.fn(async () => {
        throw new Error("provider unavailable");
      }),
    });
    await expect(
      resolveEventPageBySlugWithSources(
        "possibly-valid-event",
        new Date(),
        loaders,
      ),
    ).rejects.toBeInstanceOf(EventResolutionUnavailableError);
  });

  it("does not resolve an online-only event with no actionable join URL", async () => {
    const stranded = {
      ...event("stranded-online-class"),
      attendance_mode: "online" as const,
      source_url: null,
    };
    const loaders = sources({ live: vi.fn(async () => stranded) });
    await expect(
      resolveEventPageBySlugWithSources(stranded.slug, new Date(), loaders),
    ).resolves.toBeNull();
  });
});
