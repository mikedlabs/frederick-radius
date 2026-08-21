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

  it("serves a fresh partial archive at full trust, and still flags stale or failed runs", () => {
    // "Partial" is the collector's steady state: it aggregates ~28 upstream
    // sources and marks itself partial when ANY of them hiccups — 830
    // consecutive runs never once reported "ok". The old expectation here
    // enshrined the outage: a fresh archive holding hundreds of real events
    // was branded degraded over a handful of failed records, and downstream
    // surfaces preferred ten curated seeds to the real calendar. A fresh,
    // successfully WRITTEN archive is trustworthy; collection gaps are
    // per-source news, not a reason to reject the rows that made it in.
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
    const failed = hydrateTodayEventSnapshot(
      envelope({ archive_status: "error" }),
      NOW,
    );
    // A rejected read is not a slow read. The loader used to call every
    // failure "read timeout", so when production stopped serving live events
    // the only thing any surface could say was that the read was slow. It was
    // not: /api/health had `SELECT 1` on the same connection at 3ms. The
    // Postgres error sentence IS the diagnosis, so it has to survive.
    // A null status is the reader being locked OUT of `ingest_runs`, not the
    // collector failing. RLS denial returns zero rows rather than an error, so
    // these two states arrive looking identical and used to share a label —
    // which pointed the 2026-08-18 diagnosis at a collector that was writing
    // fine. They must never be merged again (issue #1581).
    const unreadable = hydrateTodayEventSnapshot(
      envelope({ archive_status: null }),
      NOW,
    );

    expect(partial.publicEvents.some((row) => row.slug === "archive-event-2026-07-31")).toBe(true);
    expect(partial.sourceHealth).toEqual({
      degraded: false,
      unavailable: [],
    });
    expect(stale.sourceHealth).toEqual({
      degraded: true,
      unavailable: ["event archive (stale)"],
    });
    expect(unreadable.sourceHealth).toEqual({
      degraded: true,
      unavailable: ["event archive (unreadable)"],
    });
    expect(failed.sourceHealth).toEqual({
      degraded: true,
      unavailable: ["event archive (last run failed)"],
    });
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
    // The reason is part of the contract: a timeout must be tellable apart
    // from a genuinely unusable archive, or a cold-start latency problem
    // masquerades as a data outage (which is exactly what happened).
    expect(result.sourceHealth).toEqual({
      degraded: true,
      unavailable: ["event archive (read timeout)"],
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

  it("honors the discovery read budget instead of silently clamping it below the exported value", async () => {
    vi.useFakeTimers();
    mocks.getSql.mockReturnValue(vi.fn(() => new Promise((resolve) => {
      setTimeout(() => resolve([envelope()]), 2_000);
    })));

    const pending = loadEventArchiveSnapshot(NOW);
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;

    expect(EVENT_BROWSE_SNAPSHOT_TIMEOUT_MS).toBe(2_500);
    expect(result.publicEvents).toContainEqual(
      expect.objectContaining({ slug: "archive-event-2026-07-31" }),
    );
    expect(result.sourceHealth.degraded).toBe(false);
  });
});

describe("a rejected archive read says why", () => {
  afterEach(() => {
    mocks.getSql.mockReset();
  });

  function rejectingSql(error: unknown) {
    const sql = () => {
      const pending: Promise<never> & { cancel?: () => void } =
        Promise.reject(error);
      pending.cancel = () => undefined;
      return pending;
    };
    return sql as unknown as ReturnType<typeof mocks.getSql>;
  }

  it("carries the Postgres error instead of calling it a timeout", async () => {
    mocks.getSql.mockReturnValue(
      rejectingSql(new Error("permission denied for table event_canonical_records")),
    );

    const result = await loadEventArchiveSnapshot(NOW);

    expect(result.sourceHealth.degraded).toBe(true);
    expect(result.sourceHealth.unavailable).toEqual([
      "event archive (read rejected: permission denied for table event_canonical_records)",
    ]);
    // The distinction is the whole point: this must NOT read as slowness.
    expect(result.sourceHealth.unavailable[0]).not.toContain("timeout");
  });

  it("flattens and bounds the message, because it reaches a health payload", async () => {
    mocks.getSql.mockReturnValue(
      rejectingSql(new Error(`line one\n  line two${"x".repeat(400)}`)),
    );

    const [reason] = (await loadEventArchiveSnapshot(NOW)).sourceHealth.unavailable;

    expect(reason).not.toContain("\n");
    expect(reason.length).toBeLessThan(160);
    expect(reason.startsWith("event archive (read rejected: line one line two")).toBe(true);
  });

  it("still reports a genuine absence of database as its own reason", async () => {
    mocks.getSql.mockReturnValue(null);

    const result = await loadEventArchiveSnapshot(NOW);

    expect(result.sourceHealth.unavailable).toEqual(["event archive (no database)"]);
  });
});

// ── No Date may cross the wire as a query parameter ──────────────────
//
// Production answered every archive read with:
//
//   The "string" argument must be of type string or an instance of Buffer
//   or ArrayBuffer. Received an instance of Date
//
// The driver could not serialise the parameter. /today and /events served
// compiled curated seeds from 2026-08-19 while the archive held 2,185
// records, 1,170 of them upcoming and 65 of them that day.
//
// It never reproduced locally or in CI, because both use a direct connection
// where postgres-js infers the parameter type and applies its Date
// serialiser. Production connects through the pooler, where client.ts must
// set `prepare: false`, so the inference never happens.
//
// A unit test cannot see that difference. What it CAN do is refuse to let a
// Date reach the driver at all, which is the property that actually matters.
describe("archive query parameters", () => {
  afterEach(() => {
    mocks.getSql.mockReset();
  });

  it("sends timestamps as ISO text, never as Date objects", async () => {
    const params: unknown[] = [];
    const sql = (_strings: TemplateStringsArray, ...values: unknown[]) => {
      params.push(...values);
      const pending: Promise<never[]> & { cancel?: () => void } =
        Promise.resolve([]);
      pending.cancel = () => undefined;
      return pending;
    };
    mocks.getSql.mockReturnValue(sql as unknown as ReturnType<typeof mocks.getSql>);

    await loadEventArchiveSnapshot(NOW);

    expect(params.length).toBeGreaterThan(0);
    const dates = params.filter((value) => value instanceof Date);
    expect(
      dates,
      `these parameters are Date objects and the pooled driver cannot serialise them: ${JSON.stringify(dates)}`,
    ).toEqual([]);

    // And the bounds are recognisable ISO text rather than some other string.
    const isoish = params.filter(
      (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value),
    );
    expect(isoish.length).toBeGreaterThanOrEqual(2);
  });
});
