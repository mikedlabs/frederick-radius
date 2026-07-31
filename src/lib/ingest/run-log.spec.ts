import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  getSql: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import {
  recordSourceProbeFailuresStrict,
  recordSourceProbeResultsStrict,
  startIngestRunStrict,
} from "./run-log";

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

  it("writes one completed result per source and lets failure win duplicates", async () => {
    await expect(
      recordSourceProbeResultsStrict(
        [
          { sourceSlug: "marc", outcome: "success" },
          { sourceSlug: " nps ", outcome: "success" },
          {
            sourceSlug: "marc",
            outcome: "failure",
            error: "one endpoint failed",
          },
        ],
        "2026-07-28T09:05:00.000Z",
      ),
    ).resolves.toBe(2);

    expect(mocks.sql).toHaveBeenCalledTimes(1);
    const call = mocks.sql.mock.calls[0];
    expect(call).toContainEqual(["marc", "nps"]);
    expect(call).toContainEqual(["error", "ok"]);
    expect(call).toContainEqual([null, null]);
    expect(call).toContainEqual([1, 0]);
    expect(call).toContainEqual(["one endpoint failed", null]);
  });
});

describe("strict ingest-run heartbeat cancellation", () => {
  it("cancels a queued start write when the route deadline aborts", async () => {
    let rejectQuery: (reason: unknown) => void = () => undefined;
    const query = new Promise<never>((_resolve, reject) => {
      rejectQuery = reject;
    }) as Promise<never> & { cancel: ReturnType<typeof vi.fn> };
    query.cancel = vi.fn(() => {
      rejectQuery(new Error("cancelled by route deadline"));
    });
    mocks.getSql.mockReturnValue(mocks.sql);
    mocks.sql.mockReturnValue(query);
    const controller = new AbortController();

    const heartbeat = startIngestRunStrict("event-archive", {
      signal: controller.signal,
    });
    controller.abort();

    await expect(heartbeat).rejects.toThrow("route deadline");
    expect(query.cancel).toHaveBeenCalledTimes(1);
  });
});
