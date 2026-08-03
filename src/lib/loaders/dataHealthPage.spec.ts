import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DATA_HEALTH_DB_DEADLINE_MS,
  DATA_HEALTH_FEED_DEADLINE_MS,
  DATA_HEALTH_HYDRATE_DEADLINE_MS,
  loadDataHealthPageRuntime,
} from "./dataHealthPage";

describe("data-health page runtime boundary", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("keeps successful runtime evidence", async () => {
    const sourceLedger = [{ id: "county-calendar" }];
    const runtime = await loadDataHealthPageRuntime({
      hydrateSnapshots: vi.fn().mockResolvedValue(undefined),
      getLiveEvents: vi.fn().mockResolvedValue({
        events: [],
        sources_succeeded: ["county"],
        sources_failed: [],
      }),
      getDriftDecisions: vi.fn().mockResolvedValue({ "place::hours": "accepted" }),
      getUnparseableLocationSummary: vi.fn().mockResolvedValue([
        { source: "calendar", count: 1, sample: "Town Hall" },
      ]),
      getRecentIngestRuns: vi.fn().mockResolvedValue([]),
      getFeedSnapshotStorageTelemetry: vi.fn().mockResolvedValue(null),
      getSourceHealthLedger: vi.fn().mockResolvedValue(sourceLedger),
    });

    expect(runtime.liveCheck?.sources_succeeded).toEqual(["county"]);
    expect(runtime.driftDecisions).toEqual({ "place::hours": "accepted" });
    expect(runtime.unparseable).toHaveLength(1);
    expect(runtime.sourceLedger).toBe(sourceLedger);
  });

  it("aborts the live probe and resolves every optional read fail-soft", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const never = new Promise<never>(() => undefined);
    let feedSignal: AbortSignal | undefined;
    const result = loadDataHealthPageRuntime({
      hydrateSnapshots: vi.fn(() => never),
      getLiveEvents: vi.fn((_days, options) => {
        feedSignal = options?.signal;
        return never;
      }),
      getDriftDecisions: vi.fn(() => never),
      getUnparseableLocationSummary: vi.fn(() => never),
      getRecentIngestRuns: vi.fn(() => never),
      getFeedSnapshotStorageTelemetry: vi.fn(() => never),
      getSourceHealthLedger: vi.fn(() => never),
    });

    await vi.advanceTimersByTimeAsync(DATA_HEALTH_HYDRATE_DEADLINE_MS);
    await vi.advanceTimersByTimeAsync(
      DATA_HEALTH_FEED_DEADLINE_MS + DATA_HEALTH_DB_DEADLINE_MS,
    );

    await expect(result).resolves.toMatchObject({
      liveCheck: null,
      driftDecisions: {},
      unparseable: [],
      ingestRuns: [],
      sourceLedger: [],
      snapshotStorage: null,
    });
    expect(feedSignal?.aborted).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      `[data-health-page] live event feeds timed_out after ${DATA_HEALTH_FEED_DEADLINE_MS}ms`,
    );
  });
});
