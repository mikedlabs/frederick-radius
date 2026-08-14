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
  EVENT_ARCHIVE_CARD_DESCRIPTION_LIMIT,
  EVENT_ARCHIVE_PUBLIC_READ_TIMEOUT_MS,
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
    archive_error: null,
    ...overrides,
  };
}

function archiveReadRows(overrides: Record<string, unknown> = {}) {
  const value = envelope(overrides);
  const candidates = Array.isArray(value.candidates) ? value.candidates : [];
  if (candidates.length === 0) {
    return [{
      canonical_slug: null,
      snapshot: null,
      archive_status: value.archive_status,
      archive_finished_at: value.archive_finished_at,
      archive_records_failed: value.archive_records_failed,
      archive_error: value.archive_error,
    }];
  }
  return candidates.map((candidate) => ({
    ...(candidate as Record<string, unknown>),
    archive_status: value.archive_status,
    archive_finished_at: value.archive_finished_at,
    archive_records_failed: value.archive_records_failed,
    archive_error: value.archive_error,
  }));
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
      archive: {
        state: "current",
        status: "ok",
        finishedAt: "2026-07-31T15:00:00.000Z",
        recordsFailed: 0,
        invalidSnapshots: 0,
      },
    });
  });

  it("keeps stale-good rows but marks a partial or aging archive degraded", () => {
    const partial = hydrateTodayEventSnapshot(
      envelope({
        archive_status: "partial",
        archive_records_failed: 2,
        archive_error:
          "Archive checks failed: unified-partial, live-partial.",
      }),
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
      unavailable: ["event archive providers"],
      archive: {
        state: "provider_partial",
        status: "partial",
        finishedAt: "2026-07-31T15:00:00.000Z",
        recordsFailed: 2,
        invalidSnapshots: 0,
      },
    });
    expect(stale.sourceHealth.degraded).toBe(true);
    expect(stale.sourceHealth.archive?.state).toBe("stale");
  });

  it("classifies a failed archive separately from a provider-only partial read", () => {
    const result = hydrateTodayEventSnapshot(
      envelope({
        archive_status: "partial",
        archive_records_failed: 1,
        archive_error: "Archive checks failed: archive-publication.",
      }),
      NOW,
    );

    expect(result.sourceHealth.archive?.state).toBe("failed");
    expect(result.sourceHealth.unavailable).toContain("event archive");
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
    expect(result.sourceHealth.archive?.state).toBe("invalid");
  });

  it("cancels a slow database read and returns curated fail-soft data", async () => {
    vi.useFakeTimers();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cancel = vi.fn();
    const never = Object.assign(new Promise<never>(() => undefined), {
      cancel,
    });
    mocks.getSql.mockReturnValue(vi.fn(() => never));

    const pending = loadTodayEventSnapshot(NOW);
    await vi.advanceTimersByTimeAsync(TODAY_EVENT_SNAPSHOT_TIMEOUT_MS + 1);
    const result = await pending;

    expect(cancel).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(JSON.stringify({
      level: "warn",
      event: "event_archive_public_read_failed",
      outcome: "timeout",
      timeoutMs: TODAY_EVENT_SNAPSHOT_TIMEOUT_MS,
    }));
    expect(result.sourceHealth).toEqual({
      degraded: true,
      unavailable: ["event archive"],
      archive: {
        state: "unavailable",
        status: null,
        finishedAt: null,
        recordsFailed: null,
        invalidSnapshots: 0,
      },
    });
  });

  it("lets a cold Today archive connection finish inside the bounded public-read budget", async () => {
    vi.useFakeTimers();
    mocks.getSql.mockReturnValue(vi.fn(() => new Promise((resolve) => {
      setTimeout(() => resolve(archiveReadRows()), 1_800);
    })));

    const pending = loadTodayEventSnapshot(NOW);
    await vi.advanceTimersByTimeAsync(1_800);
    const result = await pending;

    expect(TODAY_EVENT_SNAPSHOT_TIMEOUT_MS).toBe(
      EVENT_ARCHIVE_PUBLIC_READ_TIMEOUT_MS,
    );
    expect(TODAY_EVENT_SNAPSHOT_TIMEOUT_MS).toBeGreaterThan(1_800);
    expect(result.publicEvents).toContainEqual(
      expect.objectContaining({ slug: "archive-event-2026-07-31" }),
    );
    expect(result.sourceHealth.archive?.state).toBe("current");
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
      return Promise.resolve(archiveReadRows());
    });

    const result = await loadEventArchiveSnapshot(NOW);

    expect(result.publicEvents.some((row) => row.slug === "archive-event-2026-07-31")).toBe(true);
    expect(strings.join(" ")).toContain("limit");
    expect(values).toContain(1_500);
    expect(strings.join(" ")).not.toContain("jsonb_agg");
    expect(values).toContain(EVENT_ARCHIVE_CARD_DESCRIPTION_LIMIT);
    expect(strings.join(" ")).toContain(
      "jsonb_typeof(canonical.snapshot) = 'object'",
    );
    expect(strings.join(" ")).toContain("ended_at is not null");
    expect(strings.join(" ")).toContain(
      "status in ('ok', 'partial', 'error')",
    );
    expect(values.some((value) => value instanceof Date)).toBe(false);
    expect(values).toContain("2026-07-31T04:00:00.000Z");
    expect(values).toContain("2026-10-29T04:00:00.000Z");
  });

  it("records a safe error code when the archive query is rejected", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rejected = Object.assign(new TypeError("private driver detail"), {
      code: "ERR_INVALID_ARG_TYPE",
    });
    mocks.getSql.mockReturnValue(vi.fn(() => Promise.reject(rejected)));

    const result = await loadEventArchiveSnapshot(NOW);

    expect(result.sourceHealth.archive?.state).toBe("unavailable");
    expect(warning).toHaveBeenCalledWith(JSON.stringify({
      level: "warn",
      event: "event_archive_public_read_failed",
      outcome: "rejected",
      code: "ERR_INVALID_ARG_TYPE",
    }));
    expect(warning.mock.calls.flat().join(" ")).not.toContain(
      "private driver detail",
    );
  });

  it("keeps valid archive rows when another stored snapshot is scalar", async () => {
    mocks.getSql.mockReturnValue(vi.fn(() => Promise.resolve([
      ...archiveReadRows(),
      {
        canonical_slug: "malformed-scalar-event",
        snapshot: "not-an-object",
        archive_status: "ok",
        archive_finished_at: "2026-07-31T15:00:00.000Z",
        archive_records_failed: 0,
        archive_error: null,
      },
    ])));

    const result = await loadEventArchiveSnapshot(NOW);

    expect(result.publicEvents).toContainEqual(
      expect.objectContaining({ slug: "archive-event-2026-07-31" }),
    );
    expect(result.publicEvents.some(
      (row) => row.slug === "malformed-scalar-event",
    )).toBe(false);
    expect(result.sourceHealth.archive?.state).toBe("invalid");
  });

  it("lets a cold archive connection finish without collapsing discovery to curated rows", async () => {
    vi.useFakeTimers();
    mocks.getSql.mockReturnValue(vi.fn(() => new Promise((resolve) => {
      setTimeout(() => resolve(archiveReadRows()), 900);
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
      archive: {
        state: "current",
        status: "ok",
        finishedAt: "2026-07-31T15:00:00.000Z",
        recordsFailed: 0,
        invalidSnapshots: 0,
      },
    });
  });

  it("serves every readable last-known-good row when one source made the archive partial", async () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({
      canonical_slug: `archive-event-${index}-2026-08-01`,
      snapshot: event({
        slug: `archive-event-${index}-2026-08-01`,
        source_id: `archive-event-${index}`,
        title: `Archive event ${index}`,
      }),
      archive_status: "partial",
      archive_finished_at: "2026-07-31T15:00:00.000Z",
      archive_records_failed: 1,
      archive_error: "Archive checks failed: live-partial.",
    }));
    mocks.getSql.mockReturnValue(vi.fn(() => Promise.resolve(rows)));

    const result = await loadEventArchiveSnapshot(NOW);

    expect(
      result.publicEvents.filter((row) => row.slug.startsWith("archive-event-")),
    ).toHaveLength(40);
    expect(result.sourceHealth.degraded).toBe(true);
    expect(result.sourceHealth.archive?.state).toBe("provider_partial");
  });

  it("distinguishes a healthy empty archive window from a failed read", async () => {
    mocks.getSql.mockReturnValue(vi.fn(() => Promise.resolve(
      archiveReadRows({ candidates: [] }),
    )));

    const result = await loadEventArchiveSnapshot(NOW);

    expect(result.sourceHealth).toEqual({
      degraded: false,
      unavailable: [],
      archive: {
        state: "current",
        status: "ok",
        finishedAt: "2026-07-31T15:00:00.000Z",
        recordsFailed: 0,
        invalidSnapshots: 0,
      },
    });
  });
});
