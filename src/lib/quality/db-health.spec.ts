import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import { evaluateDbHealth, getRecentIngestRuns } from "./db-health";

describe("evaluateDbHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reports an explicit infrastructure anomaly when no database is configured", async () => {
    mocks.getSql.mockReturnValue(null);

    await expect(evaluateDbHealth()).resolves.toEqual({
      status: "unavailable",
      reason: "not_configured",
      anomalies: [
        expect.objectContaining({
          source: "database",
          kind: "infrastructure_unavailable",
        }),
      ],
    });
  });

  it("reports infrastructure unavailable when a required health query fails", async () => {
    const sql = vi.fn().mockRejectedValue(new Error("connection refused"));
    mocks.getSql.mockReturnValue(sql);

    const result = await evaluateDbHealth();

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "query_failed",
      anomalies: [
        {
          source: "database",
          kind: "infrastructure_unavailable",
          detail: expect.stringContaining("required health query failed"),
        },
      ],
    });
    expect(sql).toHaveBeenCalled();
  });

  it("only reports available after both database probes complete", async () => {
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ relname: "public_without_rls" }])
      .mockResolvedValueOnce([]);
    mocks.getSql.mockReturnValue(sql);

    const result = await evaluateDbHealth();

    expect(sql).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      status: "available",
      reason: null,
      anomalies: [
        expect.objectContaining({
          source: "public_without_rls",
          kind: "rls_unprotected",
        }),
      ],
    });
  });

  it("treats a fresh unchanged heartbeat as current even when event rows are old", async () => {
    const sql = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          source_domain: "www.cityoffrederickmd.gov",
          last_event_update: "2026-01-01T00:00:00.000Z",
          last_run: new Date().toISOString(),
          last_run_status: "ok",
          last_run_error: null,
        },
      ]);
    mocks.getSql.mockReturnValue(sql);

    await expect(evaluateDbHealth()).resolves.toEqual({
      status: "available",
      reason: null,
      anomalies: [],
    });
  });

  it("surfaces a fresh failed heartbeat instead of trusting older event rows", async () => {
    const sql = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          source_domain: "www.cityoffrederickmd.gov",
          last_event_update: new Date().toISOString(),
          last_run: new Date().toISOString(),
          last_run_status: "partial",
          last_run_error: "1 of 3 feeds failed",
        },
      ]);
    mocks.getSql.mockReturnValue(sql);

    const result = await evaluateDbHealth();

    expect(result).toEqual({
      status: "available",
      reason: null,
      anomalies: [
        {
          source: "www.cityoffrederickmd.gov",
          kind: "live_source_failed",
          detail: expect.stringContaining("1 of 3 feeds failed"),
        },
      ],
    });
  });

  it("reports an active source that has never produced a run or event row", async () => {
    const sql = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          source_domain: "www.new-source.test",
          last_event_update: null,
          last_run: null,
          last_run_ended: null,
          last_run_status: null,
          last_run_records_failed: null,
          last_run_error: null,
        },
      ]);
    mocks.getSql.mockReturnValue(sql);

    const result = await evaluateDbHealth();

    expect(result.anomalies).toContainEqual({
      source: "www.new-source.test",
      kind: "ingest_stale",
      detail: expect.stringContaining("never have completed"),
    });
  });

  it("does not let an ok label hide failed records", async () => {
    const now = new Date().toISOString();
    const sql = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          source_domain: "fcvfra.com",
          last_event_update: now,
          last_run: now,
          last_run_ended: now,
          last_run_status: "ok",
          last_run_records_failed: 3,
          last_run_error: null,
        },
      ]);
    mocks.getSql.mockReturnValue(sql);

    const result = await evaluateDbHealth();

    expect(result.anomalies).toContainEqual({
      source: "fcvfra.com",
      kind: "live_source_failed",
      detail: expect.stringContaining("3 records failed"),
    });
  });

  it("flags a running heartbeat that outlived the route", async () => {
    const started = new Date(Date.now() - 20 * 60_000).toISOString();
    const sql = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          source_domain: "frederick.librarycalendar.com",
          last_event_update: started,
          last_run: started,
          last_run_ended: null,
          last_run_status: "running",
          last_run_records_failed: 0,
          last_run_error: null,
        },
      ]);
    mocks.getSql.mockReturnValue(sql);

    const result = await evaluateDbHealth();

    expect(result.anomalies).toContainEqual({
      source: "frederick.librarycalendar.com",
      kind: "live_source_failed",
      detail: expect.stringContaining("still marked running"),
    });
  });
});

describe("getRecentIngestRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("omits retired one-shot source rows from the active cron board", async () => {
    const now = new Date().toISOString();
    const sql = vi.fn().mockResolvedValue([
      {
        source_slug: "frederick.librarycalendar.com",
        status: "ok",
        started_at: now,
        ended_at: now,
        records_in: 12,
        records_upserted: 0,
        records_failed: 0,
        error: null,
      },
      {
        source_slug: "data-health:feeds",
        status: "ok",
        started_at: now,
        ended_at: now,
        records_in: 12,
        records_upserted: 12,
        records_failed: 0,
        error: null,
      },
      {
        source_slug: "event-archive",
        status: "ok",
        started_at: now,
        ended_at: now,
        records_in: 800,
        records_upserted: 800,
        records_failed: 0,
        error: null,
      },
      {
        source_slug: "frederick_county_calendar",
        status: "ok",
        started_at: "2026-01-01T00:00:00.000Z",
        ended_at: "2026-01-01T00:00:01.000Z",
        records_in: 12,
        records_upserted: 12,
        records_failed: 0,
        error: null,
      },
    ]);
    mocks.getSql.mockReturnValue(sql);

    const runs = await getRecentIngestRuns();

    expect(runs).toHaveLength(3);
    expect(runs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "frederick.librarycalendar.com",
        stale: false,
      }),
      expect.objectContaining({
        source: "data-health:feeds",
        stale: false,
      }),
      expect.objectContaining({
        source: "event-archive",
        stale: false,
      }),
    ]));
  });
});
