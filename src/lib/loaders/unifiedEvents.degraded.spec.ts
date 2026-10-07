import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "./events";

const mocks = vi.hoisted(() => ({
  cacheOptions: [] as Array<{ keyParts: string[]; revalidate?: number }>,
  marker: vi.fn(async () => true),
  venueCards: [] as EventWithMeta[],
}));

// Record every unstable_cache the module declares, and hand back a spy for
// the degraded-render marker so the test sees whether a render read it.
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  unstable_cache: (
    fn: (...args: unknown[]) => Promise<unknown>,
    keyParts: string[],
    options: { revalidate?: number },
  ) => {
    mocks.cacheOptions.push({ keyParts, revalidate: options?.revalidate });
    return keyParts.includes("degraded-event-render-v1") ? mocks.marker : fn;
  },
}));

vi.mock("@/lib/loaders/venueEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/loaders/venueEvents")>()),
  venueEventsAsCards: () => mocks.venueCards,
}));

import { allUpcoming } from "./events";
import {
  assemblePromotedEvents,
  DEGRADED_EVENT_RENDER_REVALIDATE_SECONDS,
  keepDegradedEventRenderShort,
  mergeUnifiedEventCards,
  promotedEventSet,
} from "./unifiedEvents";

const NOW = new Date("2026-10-07T16:00:00.000Z");

function venueCard(slug: string): EventWithMeta {
  return {
    slug,
    title: "Open Mic Night",
    description: "Weekly open mic.",
    starts_at: "2026-10-09T23:00:00.000Z",
    ends_at: "2026-10-10T02:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Attaboy Beer",
    address: "400 Sagner Ave, Frederick, MD 21701",
    geom: { lng: -77.4013, lat: 39.4202 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: true,
    source: "venue-extract",
    is_verified: false,
    geo_confidence: "venue_match",
    category_name: "Music",
    municipality_name: "Frederick",
  } as unknown as EventWithMeta;
}

beforeEach(() => {
  mocks.marker.mockClear();
  mocks.marker.mockImplementation(async () => true);
  mocks.venueCards = [];
});

describe("promoted event set (the no-database fallback)", () => {
  it("carries the promoted venue snapshot, not the curated seeds alone", () => {
    mocks.venueCards = [venueCard("open-mic-attaboy-2026-10-09")];

    const slugs = promotedEventSet(NOW).map((e) => e.slug);
    const curatedOnly = mergeUnifiedEventCards(allUpcoming(NOW), [], [], []);

    // The curated seeds alone were one listing (Catoctin Colorfest) in
    // October 2026, and /events served exactly that as its partial board.
    expect(slugs).toContain("open-mic-attaboy-2026-10-09");
    expect(slugs).toEqual(expect.arrayContaining(curatedOnly.map((e) => e.slug)));
    expect(slugs.length).toBe(curatedOnly.length + 1);
  });

  it("is what the build-time assembly publishes", async () => {
    mocks.venueCards = [venueCard("open-mic-attaboy-2026-10-09")];

    const promoted = await assemblePromotedEvents(NOW);

    expect(promoted.unified.map((e) => e.slug)).toEqual(
      promotedEventSet(NOW).map((e) => e.slug),
    );
  });
});

describe("degraded event renders stay short-lived in the ISR cache", () => {
  it("declares a one-minute lifetime, shorter than the Events and town pages", () => {
    const marker = mocks.cacheOptions.find((entry) =>
      entry.keyParts.includes("degraded-event-render-v1"),
    );

    expect(marker?.revalidate).toBe(DEGRADED_EVENT_RENDER_REVALIDATE_SECONDS);
    expect(DEGRADED_EVENT_RENDER_REVALIDATE_SECONDS).toBeLessThan(300);
  });

  it("reads the short-lived marker only for a degraded render", async () => {
    await keepDegradedEventRenderShort({ degraded: false });
    expect(mocks.marker).not.toHaveBeenCalled();

    await keepDegradedEventRenderShort({ degraded: true });
    expect(mocks.marker).toHaveBeenCalledOnce();
  });

  it("never breaks a render when no route cache exists", async () => {
    mocks.marker.mockImplementation(async () => {
      throw new Error("Invariant: incrementalCache missing in unstable_cache");
    });

    await expect(keepDegradedEventRenderShort({ degraded: true })).resolves.toBeUndefined();
  });

  it("is applied by /events and the town pages after their event read", () => {
    const events = readFileSync(
      new URL("../../app/(app)/events/(list)/page.tsx", import.meta.url),
      "utf8",
    );
    const town = readFileSync(
      new URL("../../app/(app)/m/[municipality]/page.tsx", import.meta.url),
      "utf8",
    );

    expect(events).toContain("await keepDegradedEventRenderShort(sourceHealth)");
    expect(town).toContain("await keepDegradedEventRenderShort(eventSet.sourceHealth)");
  });

  it("puts the town page on the same archive set as /events, not the curated seeds", () => {
    const town = readFileSync(
      new URL("../../app/(app)/m/[municipality]/page.tsx", import.meta.url),
      "utf8",
    );

    expect(town).toContain("loadEventArchiveSnapshot(now)");
    expect(town).toContain("townEventsFrom(eventSet.publicEvents, m.slug, now)");
    expect(town).not.toMatch(/eventsInMunicipality\s*\(/);
    expect(town).not.toMatch(/nearTown\s*\(/);
  });
});
