import { describe, expect, it, vi } from "vitest";
import { withStatementTimeout } from "./statement-timeout";

describe("withStatementTimeout", () => {
  it("sets a transaction-local database deadline before running work", async () => {
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(),
      delete: vi.fn(),
    };
    const db = {
      transaction: vi.fn(async (run) => run(transaction)),
    };
    const work = vi.fn().mockResolvedValue(7);

    await expect(
      withStatementTimeout(db as never, 5_000, work),
    ).resolves.toBe(7);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(transaction.execute).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledWith(transaction);
    expect(transaction.execute.mock.invocationCallOrder[0]).toBeLessThan(
      work.mock.invocationCallOrder[0],
    );
  });

  it("does not open a transaction when no deadline is requested", async () => {
    const db = {
      transaction: vi.fn(),
      select: vi.fn(),
      delete: vi.fn(),
    };
    const work = vi.fn().mockResolvedValue(2);

    await expect(
      withStatementTimeout(db as never, undefined, work),
    ).resolves.toBe(2);

    expect(db.transaction).not.toHaveBeenCalled();
    expect(work).toHaveBeenCalledWith(db);
  });
});
