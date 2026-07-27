import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: mocks.getDb,
}));

import {
  persistCurrentSnapshots,
  pruneOldSnapshots,
  recordSnapshot,
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
});
