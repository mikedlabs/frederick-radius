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
    unified: vi.fn(async () => null),
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
    expect(loaders.unified).not.toHaveBeenCalled();
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
        new Date("2026-07-29T16:00:00.000Z"),
        loaders,
      ),
    ).resolves.toEqual({ event: current, kind: "live" });
    expect(persist).toHaveBeenCalledWith(current, [
      "old-title-2026-07-30",
      current.slug,
    ]);
    expect(current.source_id).toBe("publisher-uid-123");
  });

  it("resolves a card from the same unified snapshot used by the browse board", async () => {
    const visible = event("summerfest-family-theatre-2026-07-30");
    const persist = vi.fn(async (value: EventWithMeta) => ({
      id: "identity-unified",
      canonicalSlug: value.slug,
      snapshot: value,
    }));
    const loaders = sources({
      unified: vi.fn(async () => visible),
      persist,
    });

    await expect(
      resolveEventPageBySlugWithSources(
        visible.slug,
        new Date("2026-07-30T04:30:00.000Z"),
        loaders,
      ),
    ).resolves.toEqual({ event: visible, kind: "unified" });
    expect(persist).toHaveBeenCalledWith(visible, [
      visible.slug,
      visible.slug,
    ]);
  });

  it("keeps an ongoing multi-day event whose slug start day is in the past", async () => {
    const ongoing = {
      ...event("summer-exhibit-2026-07-01"),
      starts_at: "2026-07-01T14:00:00.000Z",
      ends_at: "2026-08-31T21:00:00.000Z",
    };
    const loaders = sources({
      unified: vi.fn(async () => ongoing),
      live: vi.fn(
        () => new Promise<EventWithMeta | null>(() => undefined),
      ),
    });

    await expect(
      resolveEventPageBySlugWithSources(
        ongoing.slug,
        new Date("2026-07-30T16:00:00.000Z"),
        loaders,
      ),
    ).resolves.toEqual({ event: ongoing, kind: "unified" });
    expect(loaders.live).not.toHaveBeenCalled();
  });

  it("resolves a retained ingested occurrence after its slug day has passed", async () => {
    const retained = event("library-movie-fcpl-2026-07-27");
    const loaders = sources({
      ingested: vi.fn(async () => retained),
      live: vi.fn(
        () => new Promise<EventWithMeta | null>(() => undefined),
      ),
    });

    await expect(
      resolveEventPageBySlugWithSources(
        retained.slug,
        new Date("2026-07-28T16:00:00.000Z"),
        loaders,
      ),
    ).resolves.toEqual({ event: retained, kind: "ingested" });
    expect(loaders.live).not.toHaveBeenCalled();
    expect(loaders.persist).toHaveBeenCalledWith(retained, [
      retained.slug,
      retained.slug,
    ]);
  });

  it("returns an honest miss for a past-dated slug without starting the live fanout", async () => {
    const loaders = sources({
      live: vi.fn(
        () => new Promise<EventWithMeta | null>(() => undefined),
      ),
    });

    await expect(
      resolveEventPageBySlugWithSources(
        "frederick-farmers-market-2026-05-09",
        new Date("2026-07-31T16:00:00.000Z"),
        loaders,
      ),
    ).resolves.toBeNull();
    expect(loaders.unified).toHaveBeenCalledOnce();
    expect(loaders.ingested).toHaveBeenCalledOnce();
    expect(loaders.live).not.toHaveBeenCalled();
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
      resolveEventPageBySlugWithSources(
        winner.slug,
        new Date("2026-07-29T16:00:00.000Z"),
        loaders,
      ),
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
        "game-time-urbana-2026-07-31",
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

  it("does not hide an archive failure behind a past-event 404", async () => {
    const loaders = sources({
      archive: vi.fn(async () => {
        throw new Error("archive unavailable");
      }),
    });
    const pending = resolveEventPageBySlugWithSources(
      "frederick-farmers-market-2026-05-09",
      new Date("2026-07-31T16:00:00.000Z"),
      loaders,
    );

    await expect(pending).rejects.toMatchObject({
      name: "EventResolutionUnavailableError",
      sources: ["archive"],
    } satisfies Partial<EventResolutionUnavailableError>);
    expect(loaders.live).toHaveBeenCalledOnce();
  });

  it("does not hide an archive timeout behind a past-event 404", async () => {
    vi.useFakeTimers();
    try {
      const loaders = sources({
        archive: vi.fn(
          () => new Promise<null>(() => undefined),
        ),
      });
      const pending = resolveEventPageBySlugWithSources(
        "frederick-farmers-market-2026-05-09",
        new Date("2026-07-31T16:00:00.000Z"),
        loaders,
      );
      const rejection = expect(pending).rejects.toMatchObject({
        name: "EventResolutionTimeoutError",
        sources: ["archive"],
      } satisfies Partial<EventResolutionTimeoutError>);
      await vi.advanceTimersByTimeAsync(450);
      await rejection;
      expect(loaders.live).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the Eastern day boundary before classifying a dated slug as past", async () => {
    const sameEasternDay = event("late-show-2026-07-30");
    const loaders = sources({
      live: vi.fn(async () => sameEasternDay),
    });

    await expect(
      resolveEventPageBySlugWithSources(
        sameEasternDay.slug,
        // 10 PM on July 30 in Frederick, though the UTC date is July 31.
        new Date("2026-07-31T02:00:00.000Z"),
        loaders,
      ),
    ).resolves.toEqual({ event: sameEasternDay, kind: "live" });
    expect(loaders.live).toHaveBeenCalledOnce();
  });

  it("does not treat an impossible date suffix as past routing evidence", async () => {
    const malformed = event("event-2026-02-31");
    const loaders = sources({
      live: vi.fn(async () => malformed),
    });

    await expect(
      resolveEventPageBySlugWithSources(
        malformed.slug,
        new Date("2026-03-10T16:00:00.000Z"),
        loaders,
      ),
    ).resolves.toEqual({ event: malformed, kind: "live" });
    expect(loaders.live).toHaveBeenCalledOnce();
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
