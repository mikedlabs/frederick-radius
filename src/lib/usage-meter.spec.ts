import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
  sql: vi.fn(),
  sqlBegin: vi.fn(),
}));

Object.assign(mocks.sql, { begin: mocks.sqlBegin });

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import {
  finalizeIdempotentDailyUsage,
  meterUsage,
  reserveDailyUsage,
  reserveIdempotentDailyUsage,
  reserveIdempotentDailyUsageBatch,
  reserveUsageIntervalLease,
  startIdempotentDailyUsage,
} from "./usage-meter";

describe("cross-worker interval leases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSql.mockReturnValue(mocks.sql);
  });

  it("atomically acquires one stable expiring row for the refresh namespace", async () => {
    mocks.sql.mockResolvedValue([{ count: "123456" }]);

    await expect(
      reserveUsageIntervalLease(
        "visit_frederick_refresh",
        100 * 60 * 1_000,
      ),
    ).resolves.toEqual({ acquired: true });

    const [strings, ...values] = mocks.sql.mock.calls[0] ?? [];
    const statement = Array.from(strings as TemplateStringsArray).join("?");
    expect(values).toEqual([
      "lease:visit_frederick_refresh",
      100 * 60 * 1_000,
    ]);
    expect(statement).toContain("date '1970-01-01'");
    expect(statement).toContain("on conflict (day, upstream)");
    expect(statement).toContain("where usage_counters.count <=");
    expect(statement).toContain("returning count");
  });

  it("reports an already-owned interval when the atomic write returns no row", async () => {
    mocks.sql.mockResolvedValue([]);

    await expect(
      reserveUsageIntervalLease(
        "visit_frederick_refresh",
        100 * 60 * 1_000,
      ),
    ).resolves.toEqual({ acquired: false });
  });

  it("uses one shared expiring row for every hours-refresh cycle bucket", async () => {
    mocks.sql.mockResolvedValue([{ count: "123456" }]);

    await expect(
      reserveUsageIntervalLease(
        "hours_refresh_run",
        7 * 60 * 1_000,
      ),
    ).resolves.toEqual({ acquired: true });

    const [strings, ...values] = mocks.sql.mock.calls[0] ?? [];
    const statement = Array.from(strings as TemplateStringsArray).join("?");
    expect(values).toEqual([
      "lease:hours_refresh_run",
      7 * 60 * 1_000,
    ]);
    expect(statement).toContain("date '1970-01-01'");
    expect(statement).toContain("where usage_counters.count <=");
    expect(statement).toContain("floor(extract(epoch from now()) / 60)");
  });

  it.each([0, 59_999, -1, 1.5, Number.NaN])(
    "fails closed before the database for an invalid interval (%s)",
    async (intervalMs) => {
      await expect(
        reserveUsageIntervalLease(
          "visit_frederick_refresh",
          intervalMs,
        ),
      ).resolves.toBeNull();
      expect(mocks.getSql).not.toHaveBeenCalled();
      expect(mocks.sql).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the database is missing or the lease query fails", async () => {
    mocks.getSql.mockReturnValueOnce(null);
    await expect(
      reserveUsageIntervalLease(
        "visit_frederick_refresh",
        100 * 60 * 1_000,
      ),
    ).resolves.toBeNull();

    mocks.getSql.mockReturnValue(mocks.sql);
    mocks.sql.mockRejectedValue(new Error("database unavailable"));
    await expect(
      reserveUsageIntervalLease(
        "visit_frederick_refresh",
        100 * 60 * 1_000,
      ),
    ).resolves.toBeNull();
  });
});

describe("daily paid-usage reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSql.mockReturnValue(mocks.sql);
    mocks.sqlBegin.mockImplementation(
      async (callback: (tx: typeof mocks.sql) => Promise<unknown>) =>
        callback(mocks.sql),
    );
  });

  it("atomically reserves a Firecrawl credit below the 12-per-day ceiling", async () => {
    mocks.sql.mockResolvedValue([{ count: "7" }]);

    await expect(
      reserveDailyUsage("firecrawl_visit_frederick", 12),
    ).resolves.toEqual({ reserved: true, count: 7 });

    expect(mocks.sql).toHaveBeenCalledOnce();
    const [strings, ...values] = mocks.sql.mock.calls[0] ?? [];
    const statement = Array.from(strings as TemplateStringsArray).join("?");
    expect(values).toEqual(["firecrawl_visit_frederick", 1, 1, 1, 12]);
    expect(statement).toContain("on conflict (day, upstream)");
    expect(statement).toContain("where usage_counters.count + ? <= ?");
    expect(statement).toContain("returning count");
    expect(statement).toContain("America/New_York");
  });

  it("uses the same atomic Eastern-day row for every hours-refresh invocation", async () => {
    mocks.sql.mockResolvedValue([{ count: "209" }]);

    await expect(
      reserveDailyUsage("budget_google_hours_refresh", 300),
    ).resolves.toEqual({ reserved: true, count: 209 });

    const [strings, ...values] = mocks.sql.mock.calls[0] ?? [];
    const statement = Array.from(strings as TemplateStringsArray).join("?");
    expect(values).toEqual(["budget_google_hours_refresh", 1, 1, 1, 300]);
    expect(statement).toContain("America/New_York");
    expect(statement).toContain("on conflict (day, upstream)");
    expect(statement).toContain("where usage_counters.count + ? <= ?");
  });

  it("reserves matrix elements as one all-or-nothing increment", async () => {
    mocks.sql.mockResolvedValue([{ count: "42" }]);

    await expect(
      reserveDailyUsage("google_routes_matrix", 100, 8),
    ).resolves.toEqual({ reserved: true, count: 42 });

    const [strings, ...values] = mocks.sql.mock.calls[0] ?? [];
    const statement = Array.from(strings as TemplateStringsArray).join("?");
    expect(values).toEqual(["google_routes_matrix", 8, 8, 8, 100]);
    expect(statement).toContain("where usage_counters.count + ? <= ?");
  });

  it("denies an increment larger than the cap before touching the database", async () => {
    await expect(
      reserveDailyUsage("google_routes_matrix", 5, 6),
    ).resolves.toEqual({ reserved: false, count: 5 });
    expect(mocks.getSql).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("denies the call when the atomic statement returns no row at the cap", async () => {
    mocks.sql.mockResolvedValue([]);

    await expect(
      reserveDailyUsage("firecrawl_visit_frederick", 12),
    ).resolves.toEqual({ reserved: false, count: 12 });
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "fails closed before touching the database for an invalid limit (%s)",
    async (limit) => {
      await expect(
        reserveDailyUsage("firecrawl_visit_frederick", limit),
      ).resolves.toBeNull();

      expect(mocks.getSql).not.toHaveBeenCalled();
      expect(mocks.sql).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 1.5, Number.NaN])(
    "fails closed before touching the database for an invalid increment (%s)",
    async (increment) => {
      await expect(
        reserveDailyUsage("google_routes_matrix", 100, increment),
      ).resolves.toBeNull();

      expect(mocks.getSql).not.toHaveBeenCalled();
      expect(mocks.sql).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the database is not configured", async () => {
    mocks.getSql.mockReturnValue(null);

    await expect(
      reserveDailyUsage("firecrawl_visit_frederick", 12),
    ).resolves.toBeNull();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("fails closed when obtaining the database client throws", async () => {
    mocks.getSql.mockImplementation(() => {
      throw new Error("database unavailable");
    });

    await expect(
      reserveDailyUsage("firecrawl_visit_frederick", 12),
    ).resolves.toBeNull();
  });

  it("fails closed when the atomic reservation query fails", async () => {
    mocks.sql.mockRejectedValue(new Error("usage_counters missing"));

    await expect(
      reserveDailyUsage("firecrawl_visit_frederick", 12),
    ).resolves.toBeNull();
  });

});

describe("idempotent daily paid-usage reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSql.mockReturnValue(mocks.sql);
    mocks.sqlBegin.mockImplementation(
      async (callback: (tx: typeof mocks.sql) => Promise<unknown>) =>
        callback(mocks.sql),
    );
  });

  it("reserves one normalized-address operation under one Eastern-day lock", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ claim_state: null, count: "6" }])
      .mockResolvedValueOnce([{ count: "7" }])
      .mockResolvedValueOnce([]);

    await expect(
      reserveIdempotentDailyUsage(
        "google_event_geocode",
        25,
        "1 n market st frederick md 21701",
      ),
    ).resolves.toEqual({ reserved: true, count: 7, duplicate: false });

    expect(mocks.sqlBegin).toHaveBeenCalledOnce();
    expect(mocks.sql).toHaveBeenCalledTimes(4);
    const statements = mocks.sql.mock.calls.map(([strings]) =>
      Array.from(strings as TemplateStringsArray).join("?"),
    );
    const values = mocks.sql.mock.calls.map((call) => call.slice(1));
    expect(statements[0]).toContain("pg_advisory_xact_lock");
    expect(statements[1]).toContain("America/New_York");
    expect(statements[2]).toContain("where usage_counters.count < ?");
    expect(statements[3]).toContain("insert into usage_counters");
    expect(values[0]).toEqual(["daily-cap:google_event_geocode"]);
    expect(values[2]).toEqual(["google_event_geocode", 25]);
    expect(values.flat().join(" ")).not.toContain("1 n market st");
    expect(String(values[1]?.[0])).toMatch(
      /^idempotency:google_event_geocode:[a-f0-9]{64}$/,
    );
  });

  it("does not spend twice for the same idempotency digest", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ claim_state: "2", count: "4" }]);

    await expect(
      reserveIdempotentDailyUsage(
        "google_event_geocode",
        25,
        "1 n market st frederick md",
      ),
    ).resolves.toEqual({
      reserved: false,
      count: 4,
      duplicate: true,
      duplicateState: "succeeded",
    });
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });

  it("treats a legacy or in-flight duplicate claim as pending", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ claim_state: "1", count: "4" }]);

    await expect(
      reserveIdempotentDailyUsage(
        "budget_google_business_status",
        40,
        "ChIJPendingStatusIdentity123",
      ),
    ).resolves.toEqual({
      reserved: false,
      count: 4,
      duplicate: true,
      duplicateState: "pending",
    });
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });

  it("durably claims a business-status provider identity without storing it", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ claim_state: null, count: "11" }])
      .mockResolvedValueOnce([{ count: "12" }])
      .mockResolvedValueOnce([]);

    await expect(
      reserveIdempotentDailyUsage(
        "budget_google_business_status",
        40,
        "ChIJBusinessStatusIdentity123",
      ),
    ).resolves.toEqual({ reserved: true, count: 12, duplicate: false });

    const values = mocks.sql.mock.calls.map((call) => call.slice(1));
    expect(values[0]).toEqual([
      "daily-cap:budget_google_business_status",
    ]);
    expect(String(values[1]?.[0])).toMatch(
      /^idempotency:budget_google_business_status:[a-f0-9]{64}$/,
    );
    expect(values.flat().join(" ")).not.toContain(
      "ChIJBusinessStatusIdentity123",
    );
  });

  it("denies a new address when the shared daily counter is at its cap", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ claim_state: null, count: "25" }])
      .mockResolvedValueOnce([]);

    await expect(
      reserveIdempotentDailyUsage(
        "google_event_geocode",
        25,
        "2 n market st frederick md",
      ),
    ).resolves.toEqual({ reserved: false, count: 25, duplicate: false });
  });

  it("supports the zero-cost kill switch without touching the database", async () => {
    await expect(
      reserveIdempotentDailyUsage("google_event_geocode", 0, "valid address"),
    ).resolves.toEqual({ reserved: false, count: 0, duplicate: false });
    expect(mocks.getSql).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, Number.NaN])(
    "fails closed for an invalid cap (%s)",
    async (limit) => {
      await expect(
        reserveIdempotentDailyUsage(
          "google_event_geocode",
          limit,
          "valid address",
        ),
      ).resolves.toBeNull();
      expect(mocks.getSql).not.toHaveBeenCalled();
    },
  );

  it.each(["", "   ", "x".repeat(2_049)])(
    "fails closed for an unsafe idempotency value",
    async (value) => {
      await expect(
        reserveIdempotentDailyUsage("google_event_geocode", 25, value),
      ).resolves.toBeNull();
      expect(mocks.getSql).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the database or transaction is unavailable", async () => {
    mocks.getSql.mockReturnValueOnce(null);
    await expect(
      reserveIdempotentDailyUsage(
        "google_event_geocode",
        25,
        "valid address",
      ),
    ).resolves.toBeNull();

    mocks.getSql.mockReturnValue(mocks.sql);
    mocks.sqlBegin.mockRejectedValueOnce(new Error("usage_counters missing"));
    await expect(
      reserveIdempotentDailyUsage(
        "google_event_geocode",
        25,
        "another address",
      ),
    ).resolves.toBeNull();
  });

  it("finalizes a paid claim and accepts the same terminal outcome idempotently", async () => {
    mocks.sql.mockResolvedValueOnce([{ count: "2" }]);

    await expect(
      finalizeIdempotentDailyUsage(
        "budget_google_business_status",
        "ChIJFinalizedStatusIdentity123",
        "succeeded",
      ),
    ).resolves.toEqual({ finalized: true, state: "succeeded" });

    vi.clearAllMocks();
    mocks.getSql.mockReturnValue(mocks.sql);
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: "2" }]);
    await expect(
      finalizeIdempotentDailyUsage(
        "budget_google_business_status",
        "ChIJFinalizedStatusIdentity123",
        "succeeded",
      ),
    ).resolves.toEqual({ finalized: true, state: "succeeded" });
  });

  it("atomically pre-reserves a hashed batch under one daily cap", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ordinal: "0", claim_state: null, aggregate_count: "4" },
        { ordinal: "1", claim_state: null, aggregate_count: "4" },
      ])
      .mockResolvedValueOnce([{ count: "6" }])
      .mockResolvedValueOnce([
        { upstream: "claim-a" },
        { upstream: "claim-b" },
      ]);

    await expect(
      reserveIdempotentDailyUsageBatch(
        "budget_google_hours_refresh",
        300,
        ["slug-a\u0000ChIJ-a", "slug-b\u0000ChIJ-b"],
      ),
    ).resolves.toEqual({
      reserved: true,
      count: 6,
      added: 2,
      states: ["ready", "ready"],
    });

    expect(mocks.sqlBegin).toHaveBeenCalledOnce();
    expect(mocks.sql).toHaveBeenCalledTimes(4);
    const statements = mocks.sql.mock.calls.map(([strings]) =>
      Array.from(strings as TemplateStringsArray).join("?"),
    );
    const values = mocks.sql.mock.calls.map((call) => call.slice(1));
    expect(statements[0]).toContain("pg_advisory_xact_lock");
    expect(statements[1]).toContain("jsonb_to_recordset");
    expect(statements[2]).toContain("usage_counters.count + ? <= ?");
    expect(statements[3]).toContain("on conflict (day, upstream) do nothing");
    expect(values.flat().join(" ")).not.toContain("slug-a");
    expect(values.flat().join(" ")).not.toContain("ChIJ-a");
  });

  it("reuses an unstarted batch claim without reserving the unit twice", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ordinal: "0", claim_state: "0", aggregate_count: "8" },
      ]);

    await expect(
      reserveIdempotentDailyUsageBatch(
        "budget_google_hours_refresh",
        300,
        ["slug-ready\u0000ChIJ-ready"],
      ),
    ).resolves.toEqual({
      reserved: true,
      count: 8,
      added: 0,
      states: ["ready"],
    });
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });

  it("rejects a whole idempotent batch before inserting any partial claims", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ordinal: "0", claim_state: "0", aggregate_count: "25" },
        { ordinal: "1", claim_state: null, aggregate_count: "25" },
      ]);

    await expect(
      reserveIdempotentDailyUsageBatch(
        "budget_google_hours_refresh",
        25,
        ["already-ready", "new-tail"],
      ),
    ).resolves.toEqual({
      reserved: false,
      count: 25,
      added: 0,
      states: ["ready", "ready"],
    });
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });

  it("starts only a ready batch claim before provider work", async () => {
    mocks.sql.mockResolvedValueOnce([{ count: "1" }]);

    await expect(
      startIdempotentDailyUsage(
        "budget_google_hours_refresh",
        "slug-ready\u0000ChIJ-ready",
      ),
    ).resolves.toEqual({ started: true, state: "pending" });

    const [strings, ...values] = mocks.sql.mock.calls[0] ?? [];
    const statement = Array.from(strings as TemplateStringsArray).join("?");
    expect(statement).toContain("and count = ?");
    expect(values.join(" ")).not.toContain("slug-ready");
    expect(values.join(" ")).not.toContain("ChIJ-ready");
  });
});

describe("usage meter increments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockResolvedValue([]);
    mocks.getSql.mockReturnValue(mocks.sql);
  });

  it("preserves the default one-unit increment", () => {
    meterUsage("mapbox_isochrone");

    expect(mocks.sql).toHaveBeenCalledOnce();
    expect(mocks.sql.mock.calls[0]?.slice(1)).toEqual([
      "mapbox_isochrone",
      1,
      1,
    ]);
  });

  it("records Matrix elements as a positive bounded increment", () => {
    meterUsage("mapbox_matrix", 7);

    expect(mocks.sql).toHaveBeenCalledOnce();
    expect(mocks.sql.mock.calls[0]?.slice(1)).toEqual([
      "mapbox_matrix",
      7,
      7,
    ]);
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "ignores an invalid increment (%s)",
    (increment) => {
      meterUsage("mapbox_matrix", increment);

      expect(mocks.getSql).not.toHaveBeenCalled();
      expect(mocks.sql).not.toHaveBeenCalled();
    },
  );
});
