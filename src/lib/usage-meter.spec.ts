import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import {
  meterUsage,
  reserveDailyUsage,
  reserveUsageIntervalLease,
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
  });

  it("atomically reserves a Firecrawl credit below the 12-per-day ceiling", async () => {
    mocks.sql.mockResolvedValue([{ count: "7" }]);

    await expect(
      reserveDailyUsage("firecrawl_visit_frederick", 12),
    ).resolves.toEqual({ reserved: true, count: 7 });

    expect(mocks.sql).toHaveBeenCalledOnce();
    const [strings, ...values] = mocks.sql.mock.calls[0] ?? [];
    const statement = Array.from(strings as TemplateStringsArray).join("?");
    expect(values).toEqual(["firecrawl_visit_frederick", 12]);
    expect(statement).toContain("on conflict (day, upstream)");
    expect(statement).toContain("where usage_counters.count < ?");
    expect(statement).toContain("returning count");
    expect(statement).toContain("America/New_York");
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
