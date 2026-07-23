import { describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { resolveEventPageBySlugWithSources } from "./eventResolver";

function event(slug: string): EventWithMeta {
  return {
    slug,
    title: slug,
    description: "",
    starts_at: "2026-07-23T22:00:00.000Z",
    ends_at: "2026-07-24T00:00:00.000Z",
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
    source_id: slug,
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

function sources(overrides: Partial<Parameters<typeof resolveEventPageBySlugWithSources>[2]> = {}) {
  return {
    seed: vi.fn(() => null),
    unified: vi.fn(async () => [] as EventWithMeta[]),
    live: vi.fn(async () => null),
    ingested: vi.fn(async () => null),
    ...overrides,
  };
}

describe("resolveEventPageBySlugWithSources", () => {
  it("resolves every event link emitted by the unified public snapshot", async () => {
    const visible = [event("alive-at-five-2026-07-23"), event("library-storytime-2026-07-24")];
    const loaders = sources({
      unified: vi.fn(async () => visible),
      // Simulate the cold-provider failure that used to create a temporary 404.
      live: vi.fn(async () => {
        throw new Error("provider timed out");
      }),
      ingested: vi.fn(async () => null),
    });

    for (const visibleEvent of visible) {
      await expect(
        resolveEventPageBySlugWithSources(visibleEvent.slug, new Date(), loaders),
      ).resolves.toEqual({ event: visibleEvent, kind: "unified" });
    }

    expect(loaders.live).not.toHaveBeenCalled();
    expect(loaders.ingested).not.toHaveBeenCalled();
  });

  it("keeps older shared links resolvable when the unified snapshot misses", async () => {
    const older = event("older-shared-event-2026-07-20");
    const loaders = sources({ live: vi.fn(async () => older) });

    await expect(
      resolveEventPageBySlugWithSources(older.slug, new Date(), loaders),
    ).resolves.toEqual({ event: older, kind: "live" });
  });

  it("falls through a failed unified read to the ingested resolver", async () => {
    const ingested = event("library-program-fcpl-20260723");
    const loaders = sources({
      unified: vi.fn(async () => {
        throw new Error("cache unavailable");
      }),
      live: vi.fn(async () => null),
      ingested: vi.fn(async () => ingested),
    });

    await expect(
      resolveEventPageBySlugWithSources(ingested.slug, new Date(), loaders),
    ).resolves.toEqual({ event: ingested, kind: "ingested" });
  });

  it("returns seed events without paying for any live source", async () => {
    const curated = event("curated-event");
    const loaders = sources({ seed: vi.fn(() => curated) });

    await expect(
      resolveEventPageBySlugWithSources(curated.slug, new Date(), loaders),
    ).resolves.toEqual({ event: curated, kind: "seed" });
    expect(loaders.unified).not.toHaveBeenCalled();
    expect(loaders.live).not.toHaveBeenCalled();
    expect(loaders.ingested).not.toHaveBeenCalled();
  });

  it("does not resolve a stranded online-only event", async () => {
    const stranded = {
      ...event("stranded-online-class"),
      title: "Online class",
      attendance_mode: "online" as const,
      source_url: null,
    };
    const loaders = sources({
      live: vi.fn(async () => stranded),
      ingested: vi.fn(async () => null),
    });

    await expect(
      resolveEventPageBySlugWithSources(stranded.slug, new Date(), loaders),
    ).resolves.toBeNull();
  });
});
