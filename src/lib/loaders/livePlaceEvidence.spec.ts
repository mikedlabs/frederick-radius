import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  getDb: vi.fn(),
  withStatementTimeout: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/lib/db/statement-timeout", () => ({
  withStatementTimeout: mocks.withStatementTimeout,
}));

import {
  LIVE_PLACE_EVIDENCE_STATEMENT_TIMEOUT_MS,
  loadLivePlaceEvidence,
} from "./livePlaceEvidence";

beforeEach(() => {
  mocks.getDb.mockReset();
  mocks.withStatementTimeout.mockReset();
  mocks.getDb.mockReturnValue(mocks.db);
});

describe("loadLivePlaceEvidence", () => {
  it("puts a database-enforced deadline inside the caller deadline", async () => {
    mocks.withStatementTimeout.mockResolvedValue([
      {
        slug: "gravel-and-grind-frederick",
        placeId: "ChIJ-current",
        weekdayHours: ["Monday: 8:00 AM - 5:00 PM"],
        businessStatus: "OPERATIONAL",
        refreshedAt: new Date("2026-08-11T16:00:00.000Z"),
      },
    ]);

    const result = await loadLivePlaceEvidence([
      "gravel-and-grind-frederick",
    ]);

    expect(mocks.withStatementTimeout).toHaveBeenCalledWith(
      mocks.db,
      LIVE_PLACE_EVIDENCE_STATEMENT_TIMEOUT_MS,
      expect.any(Function),
    );
    expect(result.get("gravel-and-grind-frederick")).toMatchObject({
      placeId: "ChIJ-current",
      observedAt: "2026-08-11T16:00:00.000Z",
    });
  });

  it("uses a shorter caller budget and fails soft without a database", async () => {
    mocks.withStatementTimeout.mockResolvedValue([]);
    await expect(loadLivePlaceEvidence(["test-cafe"], 75)).resolves.toEqual(
      new Map(),
    );
    expect(mocks.withStatementTimeout).toHaveBeenCalledWith(
      mocks.db,
      75,
      expect.any(Function),
    );

    mocks.withStatementTimeout.mockReset();
    mocks.getDb.mockReturnValue(null);
    await expect(loadLivePlaceEvidence(["test-cafe"])).resolves.toEqual(
      new Map(),
    );
    expect(mocks.withStatementTimeout).not.toHaveBeenCalled();
  });
});
