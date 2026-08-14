import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import {
  EVENT_BROWSE_SNAPSHOT_TIMEOUT_MS,
  loadEventArchiveSnapshot,
  hydrateTodayEventSnapshot,
  loadTodayEventSnapshot,
  TODAY_EVENT_SNAPSHOT_MAX_AGE_MS,
  TODAY_EVENT_SNAPSHOT_TIMEOUT_MS,
} from "./todayEventSnapshot";

const NOW = new Date("2026-07-31T16:00:00.000Z");

function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "archive-event-2026-07-31",
    title: "Archive event",
    description: "A current event from the durable archive.",
    starts_at: "2026-07-31T22:00:00.000Z",
    ends_at: "2026-08-01T00:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Baker Park",
    address: "121 N Bentz St, Frederick, MD 21701",
    geom: { lng: -77.4201, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    source: "city-frederick",
    is_verified: true,
    source_id: "archive-event-1",
    source_url: "https://www.cityoffrederickmd.gov/calendar",
    license: "official-public-source",
    first_seen_at: "2026-07-30T12:00:00.000Z",
    last_verified_at: "2026-07-31T14:00:00.000Z",
    confidence: "verified",
    geo_confidence: "exact_address",
    category_name: "Community",
    municipality_name: "Frederick",
    ...overrides,
  };
}

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    candidates: [
      {
        canonical_slug: "archive-event-2026-07-31",
        snapshot: event(),
      },
    ],
    archive_status: "ok",
    archive_finished_at: "2026-07-31T15:00:00.000Z",
    archive_records_failed: 0,
    ...overrides,
  };
}

describe("Today durable event snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates a current archive without degrading its trust signal", () => {
    const result = hydrateTodayEventSnapshot(envelope(), NOW);

    expect(result.publicEvents).toContainEqual(
      expect.objectContaining({
        slug: "archive-event-2026-07-31",
        title: "Archive event",
      }),
    );
    expect(result.sourceHealth).toEqual({
      degraded: false,
      unavailable: [],
    });
  });

  it("keeps stale-good rows but marks a partial or aging archive degraded", () => {
    const partial = hydrateTodayEventSnapshot(
      envelope({ archive_status: "partial", archive_records_failed: 3 }),
      NOW,
    );
    const stale = hydrateTodayEventSnapshot(
      envelope({
        archive_finished_at: new Date(
          NOW.getTime() - TODAY_EVENT_SNAPSHOT_MAX_AGE_MS - 1,
        ).toISOString(),
      }),
      NOW,
    );

    expect(partial.publicEvents.some((row) => row.slug === "archive-event-2026-07-31")).toBe(true);
    expect(partial.sourceHealth).toEqual({
      degraded: true,
      unavailable: ["event archive"],
    });
    expect(stale.sourceHealth.degraded).toBe(true);
  });

  it("withholds malformed snapshots and reports validation degradation", () => {
    const result = hydrateTodayEventSnapshot(
      envelope({
        candidates: [
          {
            canonical_slug: "bad-event",
            snapshot: { ...event(), geom: { lng: 900, lat: 39.4 } },
          },
        ],
      }),
      NOW,
    );

    expect(result.publicEvents.some((row) => row.slug === "bad-event")).toBe(false);
    expect(result.sourceHealth.unavailable).toContain("event archive validation");
  });

  it("cancels a slow database read and returns curated fail-soft data", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const never = Object.assign(new Promise<never>(() => undefined), {
      cancel,
    });
    mocks.getSql.mockReturnValue(vi.fn(() => never));

    const pending = loadTodayEventSnapshot(NOW);
    await vi.advanceTimersByTimeAsync(TODAY_EVENT_SNAPSHOT_TIMEOUT_MS + 1);
    const result = await pending;

    expect(cancel).toHaveBeenCalledOnce();
    expect(result.sourceHealth).toEqual({
      degraded: true,
      unavailable: ["event archive"],
    });
  });

  it("does not let the Today route start the live provider fan-out", () => {
    const page = readFileSync(
      new URL("../../app/(app)/today/page.tsx", import.meta.url),
      "utf8",
    );
    const endpoint = readFileSync(
      new URL("../../app/api/today/events/route.ts", import.meta.url),
      "utf8",
    );

    expect(page).toContain("loadTodayEventSnapshot(now)");
    expect(page).not.toMatch(/assembleUnifiedEvents\s*\(/);
    expect(endpoint).toContain("loadTodayEventSnapshot(now)");
    expect(endpoint).not.toMatch(/assembleUnifiedEvents\s*\(/);
  });

  it("keeps the Events board and its continuation on the durable archive", () => {
    const page = readFileSync(
      new URL("../../app/(app)/events/(list)/page.tsx", import.meta.url),
      "utf8",
    );
    const endpoint = readFileSync(
      new URL("../../app/api/events/browse/route.ts", import.meta.url),
      "utf8",
    );

    expect(page).toContain("loadEventArchiveSnapshot(now)");
    expect(page).not.toMatch(/assembleUnifiedEvents\s*\(/);
    expect(endpoint).toContain("loadEventArchiveSnapshot(now)");
    expect(endpoint).not.toMatch(/assembleUnifiedEvents\s*\(/);
  });

  it("uses a wider but still bounded archive read for event discovery", async () => {
    let strings: readonly string[] = [];
    let values: readonly unknown[] = [];
    mocks.getSql.mockReturnValue((
      parts: TemplateStringsArray,
      ...parameters: unknown[]
    ) => {
      strings = [...parts];
      values = parameters;
      return Promise.resolve([envelope()]);
    });

    const result = await loadEventArchiveSnapshot(NOW);

    expect(result.publicEvents.some((row) => row.slug === "archive-event-2026-07-31")).toBe(true);
    expect(strings.join(" ")).toContain("limit");
    expect(values).toContain(1_500);
  });

  it("lets a cold archive connection finish without collapsing discovery to curated rows", async () => {
    vi.useFakeTimers();
    mocks.getSql.mockReturnValue(vi.fn(() => new Promise((resolve) => {
      setTimeout(() => resolve([envelope()]), 900);
    })));

    const pending = loadEventArchiveSnapshot(NOW);
    await vi.advanceTimersByTimeAsync(900);
    const result = await pending;

    expect(EVENT_BROWSE_SNAPSHOT_TIMEOUT_MS).toBeGreaterThan(900);
    expect(result.publicEvents).toContainEqual(
      expect.objectContaining({
        slug: "archive-event-2026-07-31",
        title: "Archive event",
      }),
    );
    expect(result.sourceHealth).toEqual({
      degraded: false,
      unavailable: [],
    });
  });
});
