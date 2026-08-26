import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  loadEventArchiveSnapshot: vi.fn(),
  recheckHistoricalSearchMiss: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/loaders/todayEventSnapshot", () => ({
  loadEventArchiveSnapshot: mocks.loadEventArchiveSnapshot,
}));
vi.mock("@/lib/telemetry/searchGapRecheck", () => ({
  recheckHistoricalSearchMiss: mocks.recheckHistoricalSearchMiss,
}));

import { getDataGaps } from "./searchGaps";

function databaseReturning(rows: readonly Record<string, unknown>[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn(() => ({ limit }));
  const groupBy = vi.fn(() => ({ orderBy }));
  const where = vi.fn(() => ({ groupBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select };
}

describe("data-gap reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadEventArchiveSnapshot.mockResolvedValue({
      publicEvents: [],
      sourceHealth: { degraded: false },
    });
    mocks.recheckHistoricalSearchMiss.mockReturnValue({
      status: "candidate-to-verify",
      candidateCount: 1,
      lead: { title: "Current candidate", href: "/places/current", source: "ranked" },
    });
  });

  it("reports window totals rather than summing only the limited visible rows", async () => {
    mocks.getDb.mockReturnValue(databaseReturning([
      {
        query: "quiet place to read",
        kind: "search",
        count: 5,
        lastAt: new Date(),
        windowTotal: 19,
        windowDistinct: 8,
      },
    ]));

    const result = await getDataGaps({ days: 30, limit: 1 });

    expect(result.total).toBe(19);
    expect(result.distinct).toBe(8);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({
      query: "quiet place to read",
      count: 5,
      status: "candidate-to-verify",
    });
    expect(mocks.loadEventArchiveSnapshot).toHaveBeenCalledOnce();
  });

  it("does not run the event archive for an Ask-only review queue", async () => {
    mocks.getDb.mockReturnValue(databaseReturning([
      {
        query: "what should I do tonight",
        kind: "ask",
        count: 2,
        lastAt: new Date(),
        windowTotal: 2,
        windowDistinct: 1,
      },
    ]));

    await getDataGaps();

    expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
    expect(mocks.recheckHistoricalSearchMiss).toHaveBeenCalledWith(
      "what should I do tonight",
      "ask",
      undefined,
      { eventArchiveDegraded: false },
    );
  });

  it("fails soft when the database is unavailable", async () => {
    mocks.getDb.mockReturnValue(null);

    await expect(getDataGaps()).resolves.toEqual({
      gaps: [],
      total: 0,
      distinct: 0,
      days: 0,
    });
    expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
  });
});
