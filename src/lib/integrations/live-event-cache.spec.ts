import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@/lib/integrations/ical-live";
import {
  LIVE_EVENT_CACHE_ENTRY_BUDGET_BYTES,
  buildLiveEventCachePage,
  inflateCachedLiveEvent,
  liveEventCacheEntryBytes,
  liveEventCacheSourceState,
} from "./live-event-cache";

function event(
  index: number,
  overrides: Partial<LiveEvent> = {},
): LiveEvent {
  return {
    id: `source-event-${index}`,
    title: `Frederick event ${index}`,
    description: `A verified event description for row ${index}.`,
    starts_at: `2026-08-${String((index % 28) + 1).padStart(2, "0")}T22:00:00.000Z`,
    ends_at: `2026-08-${String((index % 28) + 1).padStart(2, "0")}T23:00:00.000Z`,
    venue_name: "Carroll Creek Amphitheater",
    address: "44 South Market Street, Frederick, MD 21701",
    geom: { lng: -77.4109, lat: 39.4137 },
    placement: "geocoded",
    municipality: "frederick",
    category: "music",
    organizer: "Celebrate Frederick",
    source: "celebrate",
    source_label: "Celebrate Frederick",
    url: `https://example.com/events/${index}`,
    is_free: false,
    price_text: "From $12",
    attendance_mode: "physical",
    status: "scheduled",
    last_verified_at: "2026-07-28T12:00:00.000Z",
    ...overrides,
  };
}

describe("live event cache pages", () => {
  it("round-trips every normal LiveEvent field without changing its meaning", () => {
    const original = event(1, {
      is_all_day: true,
      attendance_mode: "mixed",
      online_url: "https://example.com/watch",
      hero_image: "https://s1.ticketm.net/image.jpg",
      status: "postponed",
      publisher_updated_at: "2026-07-28T11:45:00.000Z",
    });
    const page = buildLiveEventCachePage([original], "ok");
    const inflated = inflateCachedLiveEvent(
      page.e[0],
      original.source,
      original.source_label,
    );

    expect(page.n).toBeNull();
    expect(liveEventCacheSourceState(page)).toBe("ok");
    expect(inflated).toEqual(original);
  });

  it("paginates a large source without dropping events or exceeding a shard budget", () => {
    const originals = Array.from({ length: 240 }, (_, index) =>
      event(index, {
        description: `${index}: ${"Frederick county event detail ".repeat(40)}`,
      }),
    );
    const recovered: LiveEvent[] = [];
    const measured: number[] = [];
    let cursor: string | null = null;
    let pageCount = 0;

    do {
      const page = buildLiveEventCachePage(
        originals,
        "ok",
        cursor,
        24_000,
      );
      measured.push(liveEventCacheEntryBytes(page));
      recovered.push(
        ...page.e.map((record) =>
          inflateCachedLiveEvent(record, "celebrate", "Celebrate Frederick"),
        ),
      );
      cursor = page.n;
      pageCount += 1;
      expect(pageCount).toBeLessThan(240);
    } while (cursor !== null);

    expect(pageCount).toBeGreaterThan(1);
    expect(Math.max(...measured)).toBeLessThanOrEqual(24_000);
    expect(recovered.map((row) => row.id).sort()).toEqual(
      originals.map((row) => row.id).sort(),
    );
  });

  it("keeps a pathological event as a bounded record instead of dropping the row", () => {
    const huge = "🍺".repeat(600_000);
    const page = buildLiveEventCachePage(
      [
        event(99, {
          id: huge,
          title: huge,
          description: huge,
          venue_name: huge,
          address: huge,
          organizer: huge,
          url: `https://example.com/${huge}`,
          online_url: `https://example.com/${huge}`,
          hero_image: `https://example.com/${huge}`,
        }),
      ],
      "failed",
    );
    const restored = inflateCachedLiveEvent(
      page.e[0],
      "celebrate",
      "Celebrate Frederick",
    );

    expect(page.e).toHaveLength(1);
    expect(restored.id).toMatch(/~[0-9a-f]{16}$/);
    expect(restored.title.endsWith("…")).toBe(true);
    expect(restored.url).toBe("");
    expect(restored.online_url).toBeUndefined();
    expect(restored.hero_image).toBeUndefined();
    expect(liveEventCacheSourceState(page)).toBe("failed");
    expect(liveEventCacheEntryBytes(page)).toBeLessThanOrEqual(
      LIVE_EVENT_CACHE_ENTRY_BUDGET_BYTES,
    );
  });

  it("leaves wide headroom even when every cache-safe field is near its ceiling", () => {
    const nearLimitUrl = `https://example.com/${"u".repeat(15_000)}`;
    const page = buildLiveEventCachePage(
      [
        event(98, {
          id: "i".repeat(1_900),
          title: "t".repeat(3_900),
          description: "d".repeat(3_900),
          venue_name: "v".repeat(1_900),
          address: "a".repeat(3_900),
          municipality: "m".repeat(450),
          category: "c".repeat(450),
          organizer: "o".repeat(1_900),
          url: nearLimitUrl,
          online_url: nearLimitUrl,
          hero_image: nearLimitUrl,
          price_text: "p".repeat(900),
        }),
      ],
      "ok",
    );

    expect(page.e).toHaveLength(1);
    expect(liveEventCacheEntryBytes(page)).toBeLessThan(80_000);
  });

  it("keeps the production cache envelope below the conservative 1.5 MB ceiling", () => {
    const dense = Array.from({ length: 6_000 }, (_, index) =>
      event(index, {
        title: `Event ${index} ${"x".repeat(220)}`,
        description: `${"Useful detail. ".repeat(20)}${index}`,
      }),
    );
    const first = buildLiveEventCachePage(dense, "ok");

    expect(first.n).not.toBeNull();
    expect(first.e.length).toBeGreaterThan(0);
    expect(liveEventCacheEntryBytes(first)).toBeLessThanOrEqual(
      LIVE_EVENT_CACHE_ENTRY_BUDGET_BYTES,
    );
  });
});
