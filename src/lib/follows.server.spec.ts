import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/client";
import { MAX_FOLLOWED_PLACES } from "@/lib/follows-contract";
import {
  addFollowWithinLimit,
  readFollowedPlaceSnapshot,
  syncFollowsWithinLimit,
} from "@/lib/follows.server";

function asDatabase(value: unknown): Database {
  return value as Database;
}

describe("bounded account follows", () => {
  it("reads the most recent bounded window and discloses older rows", async () => {
    const rows = Array.from(
      { length: MAX_FOLLOWED_PLACES + 1 },
      (_, index) => ({ slug: `recent-${index}` }),
    );
    const limit = vi.fn(async () => rows);
    const db = asDatabase({
      select: () => ({
        from: () => ({
          where: () => ({ orderBy: () => ({ limit }) }),
        }),
      }),
    });

    const snapshot = await readFollowedPlaceSnapshot(db, "account-a");

    expect(limit).toHaveBeenCalledWith(MAX_FOLLOWED_PLACES + 1);
    expect(snapshot.slugs).toHaveLength(MAX_FOLLOWED_PLACES);
    expect(snapshot.slugs[0]).toBe("recent-0");
    expect(snapshot.slugs.at(-1)).toBe(`recent-${MAX_FOLLOWED_PLACES - 1}`);
    expect(snapshot.truncated).toBe(true);
  });

  it("allows an idempotent existing follow even when the account is full", async () => {
    const insert = vi.fn();
    const transaction = {
      execute: vi.fn(async () => undefined),
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({ limit: async () => [{ slug: "already-saved" }] }),
        }),
      })),
      insert,
    };
    const db = asDatabase({
      transaction: (run: (tx: typeof transaction) => unknown) => run(transaction),
    });

    await expect(
      addFollowWithinLimit(db, "account-a", "already-saved", "place_detail"),
    ).resolves.toBe("existing");
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a new follow at the cap without deleting an older save", async () => {
    const insert = vi.fn();
    const transaction = {
      execute: vi.fn(async () => undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: async () => [] }) }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: async () => [{ value: MAX_FOLLOWED_PLACES }],
          }),
        }),
      insert,
      delete: vi.fn(),
    };
    const db = asDatabase({
      transaction: (run: (tx: typeof transaction) => unknown) => run(transaction),
    });

    await expect(
      addFollowWithinLimit(db, "account-a", "one-too-many", "place_detail"),
    ).resolves.toBe("limit");
    expect(insert).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it("fills remaining sync capacity in caller-provided recent-first order", async () => {
    const values = vi.fn(() => ({
      onConflictDoNothing: vi.fn(async () => undefined),
    }));
    const transaction = {
      execute: vi.fn(async () => undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: async () => [{ value: MAX_FOLLOWED_PLACES - 2 }],
          }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [] }),
        }),
      insert: vi.fn(() => ({ values })),
    };
    const db = asDatabase({
      transaction: (run: (tx: typeof transaction) => unknown) => run(transaction),
    });

    const result = await syncFollowsWithinLimit(
      db,
      "account-a",
      ["newest", "next-newest", "older"],
    );

    expect(result).toEqual({
      inserted: 2,
      acceptedSlugs: ["newest", "next-newest"],
      skipped: 1,
      atLimit: true,
      limit: MAX_FOLLOWED_PLACES,
    });
    expect(values).toHaveBeenCalledWith([
      { user_id: "account-a", place_slug: "newest", source: "synced" },
      { user_id: "account-a", place_slug: "next-newest", source: "synced" },
    ]);
  });
});
