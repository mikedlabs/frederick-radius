import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  getSql: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import { recordSourceProbeFailuresStrict } from "./run-log";

describe("runtime source failure evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockResolvedValue([]);
    mocks.getSql.mockReturnValue(mocks.sql);
  });

  it("deduplicates named failures into one database write", async () => {
    await expect(
      recordSourceProbeFailuresStrict(
        ["county", " city ", "county", ""],
        "2026-07-28T09:05:00.000Z",
      ),
    ).resolves.toBe(2);

    expect(mocks.sql).toHaveBeenCalledTimes(1);
    const call = mocks.sql.mock.calls[0];
    expect(call).toContain("2026-07-28T09:05:00.000Z");
    expect(call).toContainEqual(["county", "city"]);
  });

  it("rejects invalid timestamps before touching the database", async () => {
    await expect(
      recordSourceProbeFailuresStrict(["county"], "not-a-date"),
    ).rejects.toThrow("valid timestamp");
    expect(mocks.getSql).not.toHaveBeenCalled();
  });

  it("returns zero when there are no named source failures", async () => {
    await expect(
      recordSourceProbeFailuresStrict([], "2026-07-28T09:05:00.000Z"),
    ).resolves.toBe(0);
    expect(mocks.getSql).not.toHaveBeenCalled();
  });
});
