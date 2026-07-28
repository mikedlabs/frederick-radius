import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getSql: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: mocks.getDb,
  getSql: mocks.getSql,
}));

import {
  _resetHydrateThrottle,
  compactDuplicateSnapshots,
  getFeedSnapshotStorageTelemetry,
  hydrateSnapshotsStrict,
  persistCurrentSnapshots,
  persistCurrentSnapshotsStrict,
  pruneOldSnapshots,
  recordSnapshot,
  SNAPSHOT_COMPACTION_BATCH_SIZE,
  SNAPSHOT_DUPLICATE_TELEMETRY_LIMIT,
  SNAPSHOT_PRUNE_BATCH_SIZE,
} from "./feed-snapshot";

function row(
  overrides: Partial<{
    venue_name: string;
    category: string;
    is_free: boolean;
    description: string;
    starts_at: string;
  }> = {},
) {
  return {
    venue_name: "Test venue",
    category: "community",
    is_free: false,
    description: "A useful event description.",
    starts_at: "2026-07-28T22:00:00.000Z",
    ...overrides,
  };
}

function insertDb(options: { rejectWith?: Error } = {}) {
  const values = options.rejectWith
    ? vi.fn().mockRejectedValue(options.rejectWith)
    : vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  return {
    db: { insert },
    insert,
    values,
  };
}

function pruneDb(deletedIds = ["one", "two"]) {
  const limitedQuery = { kind: "limited-subquery" };
  const limit = vi.fn(() => limitedQuery);
  const orderBy = vi.fn(() => ({ limit }));
  const selectWhere = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from }));
  const returning = vi.fn().mockResolvedValue(
    deletedIds.map((id) => ({ id })),
  );
  const deleteWhere = vi.fn(() => ({ returning }));
  const deleteRows = vi.fn(() => ({ where: deleteWhere }));
  return {
    db: { select, delete: deleteRows },
    limit,
    deleteRows,
    deleteWhere,
    returning,
  };
}

describe("feed snapshot persistence boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSql.mockReturnValue(null);
  });

  it("never touches the database when an ordinary feed records a snapshot", () => {
    const database = insertDb();
    mocks.getDb.mockReturnValue(database.db);

    recordSnapshot("__test_request_path__", [row()]);

    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(database.insert).not.toHaveBeenCalled();
    expect(database.values).not.toHaveBeenCalled();
  });

  it("bulk-writes only the latest snapshot for each requested successful source", async () => {
    const database = insertDb();
    mocks.getDb.mockReturnValue(database.db);

    recordSnapshot("__test_county__", [row()]);
    recordSnapshot("__test_county__", [
      row(),
      row({ venue_name: "Second venue", is_free: true }),
    ]);
    recordSnapshot("__test_library__", [
      row({ category: "library", description: "" }),
    ]);
    recordSnapshot("__test_failed_feed__", [row()]);

    const persisted = await persistCurrentSnapshots([
      "__test_county__",
      "__test_library__",
      "__test_county__",
      "__test_missing__",
    ]);

    expect(persisted).toBe(2);
    expect(database.insert).toHaveBeenCalledTimes(1);
    expect(database.values).toHaveBeenCalledTimes(1);

    const payload = database.values.mock.calls[0][0] as Array<{
      source: string;
      count: number;
    }>;
    expect(payload).toHaveLength(2);
    expect(payload.map(({ source }) => source).sort()).toEqual([
      "__test_county__",
      "__test_library__",
    ]);
    expect(payload.find(({ source }) => source === "__test_county__")?.count)
      .toBe(2);
    expect(payload.some(({ source }) => source === "__test_failed_feed__"))
      .toBe(false);
  });

  it("returns zero instead of breaking the health cron when persistence fails", async () => {
    const database = insertDb({
      rejectWith: new Error("database temporarily unavailable"),
    });
    mocks.getDb.mockReturnValue(database.db);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    recordSnapshot("__test_fail_soft__", [row()]);

    await expect(
      persistCurrentSnapshots(["__test_fail_soft__"]),
    ).resolves.toBe(0);
    expect(database.insert).toHaveBeenCalledTimes(1);
    expect(database.values).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[feed-snapshot] cron persist failed"),
      "database temporarily unavailable",
    );

    warn.mockRestore();
  });

  it("lets the bounded feed worker report a persistence failure", async () => {
    const database = insertDb();
    database.values.mockRejectedValue(new Error("write unavailable"));
    mocks.getDb.mockReturnValue(database.db);

    recordSnapshot("__test_strict_persist__", [row()]);

    await expect(
      persistCurrentSnapshotsStrict(["__test_strict_persist__"]),
    ).rejects.toThrow("write unavailable");
  });

  it("lets cron workers report snapshot hydration query failures", async () => {
    const limit = vi.fn().mockRejectedValue(new Error("read unavailable"));
    const orderBy = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ orderBy }));
    const select = vi.fn(() => ({ from }));
    mocks.getDb.mockReturnValue({ select });
    _resetHydrateThrottle();

    await expect(hydrateSnapshotsStrict()).rejects.toThrow(
      "read unavailable",
    );
  });

  it("caps retention deletes to one bounded oldest-first batch", async () => {
    const database = pruneDb();
    mocks.getDb.mockReturnValue(database.db);

    await expect(
      pruneOldSnapshots(90, SNAPSHOT_PRUNE_BATCH_SIZE * 100),
    ).resolves.toBe(2);

    expect(database.limit).toHaveBeenCalledWith(SNAPSHOT_PRUNE_BATCH_SIZE);
    expect(database.deleteRows).toHaveBeenCalledTimes(1);
    expect(database.returning).toHaveBeenCalledTimes(1);
  });

  it("propagates a retention failure to the cron health gate", async () => {
    const database = pruneDb();
    database.returning.mockRejectedValue(new Error("statement timeout"));
    mocks.getDb.mockReturnValue(database.db);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(pruneOldSnapshots(90)).rejects.toThrow("statement timeout");
    expect(warn).toHaveBeenCalledWith(
      "[feed-snapshot] retention prune failed:",
      "statement timeout",
    );

    warn.mockRestore();
  });

  it("compacts only a bounded batch with a newer same-source daily keeper", async () => {
    const query = vi.fn().mockResolvedValue([
      { id: "duplicate-one" },
      { id: "duplicate-two" },
    ]);
    mocks.getSql.mockReturnValue(query);

    await expect(
      compactDuplicateSnapshots(SNAPSHOT_COMPACTION_BATCH_SIZE * 100),
    ).resolves.toBe(2);

    expect(query).toHaveBeenCalledTimes(1);
    const strings = (query.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(strings).toContain("keeper.source = candidate.source");
    expect(strings).toContain("date_trunc('day', candidate.taken_at");
    expect(strings).toContain("keeper.taken_at > candidate.taken_at");
    expect(strings).toContain("DELETE FROM feed_snapshots");
    expect(query.mock.calls[0]).toContain(SNAPSHOT_COMPACTION_BATCH_SIZE);
  });

  it("does not report a failed compaction as a successful zero-row batch", async () => {
    const query = vi.fn().mockRejectedValue(new Error("statement timeout"));
    mocks.getSql.mockReturnValue(query);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(compactDuplicateSnapshots()).rejects.toThrow(
      "statement timeout",
    );
    expect(warn).toHaveBeenCalledWith(
      "[feed-snapshot] duplicate compaction failed:",
      "statement timeout",
    );

    warn.mockRestore();
  });

  it("reports bounded backlog telemetry instead of an exact duplicate scan", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          approximate_rows: "711327",
          total_bytes: "248512512",
          oldest_at: "2026-05-28T12:00:00.000Z",
          newest_at: "2026-07-27T12:45:00.000Z",
          rows_last_24_hours: "20",
        },
      ])
      .mockResolvedValueOnce([
        { duplicate_candidates: String(SNAPSHOT_DUPLICATE_TELEMETRY_LIMIT) },
      ]);
    mocks.getSql.mockReturnValue(query);

    await expect(getFeedSnapshotStorageTelemetry()).resolves.toMatchObject({
      approximateRows: 711327,
      rowsLast24Hours: 20,
      duplicateCandidates: SNAPSHOT_DUPLICATE_TELEMETRY_LIMIT - 1,
      duplicateCountCapped: true,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("fails closed when storage telemetry is malformed", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          approximate_rows: "not-a-count",
          total_bytes: "248512512",
          oldest_at: null,
          newest_at: null,
          rows_last_24_hours: "20",
        },
      ])
      .mockResolvedValueOnce([{ duplicate_candidates: "0" }]);
    mocks.getSql.mockReturnValue(query);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(getFeedSnapshotStorageTelemetry()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "[feed-snapshot] storage telemetry failed:",
      "Snapshot telemetry returned an invalid numeric value.",
    );

    warn.mockRestore();
  });
});
