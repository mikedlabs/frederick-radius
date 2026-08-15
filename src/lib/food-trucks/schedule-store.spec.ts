import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@vercel/blob", () => mocks);

import {
  FOOD_TRUCK_SCHEDULE_BLOB,
  MAX_FOOD_TRUCK_SCHEDULE_BYTES,
  isFoodTruckScheduleSnapshot,
  reconcileFoodTruckSchedule,
  readStoredFoodTruckSchedule,
  readStoredFoodTruckScheduleArtifact,
  writeFoodTruckSchedule,
} from "./schedule-store";
import type { FoodTruckScheduleSnapshot } from "./schedule-types";

const previousBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

describe("food-truck schedule cache validation", () => {
  const valid: FoodTruckScheduleSnapshot = {
    version: 1,
    generatedAt: "2026-07-22T12:00:00.000Z",
    windowStart: "2026-07-22T04:00:00.000Z",
    windowEnd: "2026-07-30T04:00:00.000Z",
    stops: [{
      id: "stop-1",
      title: "A stop",
      startsAt: "2026-07-24T21:00:00.000Z",
      venueName: "A venue",
      vendors: [{ name: "A truck" }],
      sourceName: "Official source",
      sourceUrl: "https://example.com",
      confidence: "venue",
    }],
    sources: [{
      id: "source",
      label: "Official source",
      ok: true,
      count: 1,
      checkedAt: "2026-07-22T12:00:00.000Z",
    }],
  };

  const found = (
    snapshot: FoodTruckScheduleSnapshot = valid,
    etag = '"schedule-etag"',
  ) => ({ status: "found" as const, snapshot, etag });

  const blobResult = (
    snapshot: FoodTruckScheduleSnapshot,
    etag = '"schedule-etag"',
  ) => {
    const payload = JSON.stringify(snapshot);
    return {
      statusCode: 200,
      stream: new Response(payload).body,
      blob: {
        size: new TextEncoder().encode(payload).byteLength,
        etag,
      },
    };
  };

  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mocks.get.mockReset();
    mocks.put.mockReset();
    mocks.put.mockResolvedValue({ url: "https://blob.example/schedule.json" });
  });

  afterEach(() => {
    if (previousBlobToken === undefined) {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    } else {
      process.env.BLOB_READ_WRITE_TOKEN = previousBlobToken;
    }
  });

  it("accepts a complete serialized snapshot", () => {
    expect(isFoodTruckScheduleSnapshot(valid)).toBe(true);
  });

  it("rejects a partial stop instead of rendering corrupted data", () => {
    expect(isFoodTruckScheduleSnapshot({ ...valid, stops: [{ id: "broken" }] })).toBe(false);
  });

  it("rejects malformed source health instead of trusting a partial cache", () => {
    expect(isFoodTruckScheduleSnapshot({
      ...valid,
      sources: [{ id: "source", label: "Source", ok: true, count: -1, checkedAt: "now" }],
    })).toBe(false);
  });

  it("rejects a snapshot that has no tracked source identities", () => {
    expect(isFoodTruckScheduleSnapshot({ ...valid, sources: [] })).toBe(false);
  });

  it("retains only the failed source's still-future last-known-good stops", () => {
    const previous = {
      ...valid,
      generatedAt: "2026-07-22T12:00:00.000Z",
      stops: [
        { ...valid.stops[0], id: "failed-future", sourceId: "failed-source", sourceName: "Failed source" },
        { ...valid.stops[0], id: "healthy-future", sourceId: "healthy-source", sourceName: "Healthy source" },
        { ...valid.stops[0], id: "failed-expired", sourceId: "failed-source", sourceName: "Failed source", startsAt: "2026-07-21T20:00:00.000Z" },
      ],
      sources: [
        { id: "failed-source", label: "Failed source", ok: true, count: 2, checkedAt: "2026-07-22T12:00:00.000Z" },
        { id: "healthy-source", label: "Healthy source", ok: true, count: 1, checkedAt: "2026-07-22T12:00:00.000Z" },
      ],
    } satisfies FoodTruckScheduleSnapshot;
    const next = {
      ...valid,
      generatedAt: "2026-07-23T12:00:00.000Z",
      windowStart: "2026-07-23T04:00:00.000Z",
      stops: [],
      sources: [
        { id: "failed-source", label: "Failed source", ok: false, count: 0, checkedAt: "2026-07-23T12:00:00.000Z", error: "HTTP 503" },
        { id: "healthy-source", label: "Healthy source", ok: true, count: 0, checkedAt: "2026-07-23T12:00:00.000Z" },
      ],
    } satisfies FoodTruckScheduleSnapshot;

    const reconciled = reconcileFoodTruckSchedule(next, previous);

    expect(reconciled.stops.map((stop) => stop.id)).toEqual([
      "failed-future",
      "healthy-future",
    ]);
    expect(reconciled.sources[0]).toMatchObject({
      ok: false,
      previousCount: 1,
      retainedCount: 1,
      lastSuccessAt: "2026-07-22T12:00:00.000Z",
    });
    expect(reconciled.sources[1]).toMatchObject({
      ok: true,
      previousCount: 1,
      retainedCount: 1,
      suspiciousZero: true,
      lastSuccessAt: "2026-07-23T12:00:00.000Z",
    });

    const reconciledAgain = reconcileFoodTruckSchedule(reconciled, previous);
    expect(reconciledAgain.sources.map((source) => source.retainedCount)).toEqual([
      1,
      1,
    ]);
  });

  it("flags a large drop and retains the missing still-future records", () => {
    const priorStops = Array.from({ length: 5 }, (_, index) => ({
      ...valid.stops[0],
      id: `prior-${index}`,
      sourceId: "venue",
      sourceName: "Venue",
      startsAt: `2026-07-2${4 + index}T21:00:00.000Z`,
    }));
    const previous = {
      ...valid,
      stops: priorStops,
      sources: [{ id: "venue", label: "Venue", ok: true, count: 5, checkedAt: "2026-07-22T12:00:00.000Z" }],
    } satisfies FoodTruckScheduleSnapshot;
    const next = {
      ...valid,
      generatedAt: "2026-07-23T12:00:00.000Z",
      stops: [priorStops[0], priorStops[1]],
      sources: [{ id: "venue", label: "Venue", ok: true, count: 2, checkedAt: "2026-07-23T12:00:00.000Z" }],
    } satisfies FoodTruckScheduleSnapshot;

    const reconciled = reconcileFoodTruckSchedule(next, previous);

    expect(reconciled.stops).toHaveLength(5);
    expect(reconciled.sources[0]).toMatchObject({
      previousCount: 5,
      retainedCount: 3,
      suspiciousDrop: true,
    });

    expect(
      reconcileFoodTruckSchedule(reconciled, previous).sources[0],
    ).toMatchObject({ retainedCount: 3, suspiciousDrop: true });
  });

  it("uses the Blob CDN for cache-first surface reads", async () => {
    mocks.get.mockResolvedValue(blobResult(valid));

    await expect(readStoredFoodTruckSchedule({
      cacheMode: "cache-first",
      timeoutMs: 250,
    })).resolves.toEqual(valid);

    expect(mocks.get).toHaveBeenCalledWith(
      FOOD_TRUCK_SCHEDULE_BLOB,
      expect.objectContaining({
        access: "public",
        useCache: true,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it("keeps origin-fresh reads off the CDN cache", async () => {
    mocks.get.mockResolvedValue(null);

    await expect(readStoredFoodTruckSchedule()).resolves.toBeNull();

    expect(mocks.get).toHaveBeenCalledWith(
      FOOD_TRUCK_SCHEDULE_BLOB,
      expect.objectContaining({
        useCache: false,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it("distinguishes an absent artifact from an unavailable artifact", async () => {
    mocks.get.mockResolvedValueOnce(null);
    await expect(readStoredFoodTruckScheduleArtifact()).resolves.toEqual({
      status: "absent",
    });

    mocks.get.mockRejectedValueOnce(new Error("Blob service unavailable"));
    await expect(readStoredFoodTruckScheduleArtifact()).resolves.toMatchObject({
      status: "unavailable",
      reason: expect.stringContaining("read failed"),
    });
  });

  it("passes a real deadline signal to Blob and stops a hung read", async () => {
    let observedSignal: AbortSignal | undefined;
    mocks.get.mockImplementation((_pathname, options) => {
      observedSignal = options.abortSignal;
      return new Promise((_resolve, reject) => {
        const rejectAbort = () => reject(new DOMException("aborted", "AbortError"));
        if (observedSignal?.aborted) {
          rejectAbort();
        } else {
          observedSignal?.addEventListener("abort", rejectAbort, { once: true });
        }
      });
    });

    await expect(readStoredFoodTruckSchedule({
      cacheMode: "cache-first",
      timeoutMs: 25,
    })).resolves.toBeNull();

    expect(observedSignal).toBeDefined();
    expect(observedSignal?.aborted).toBe(true);
  });

  it("rejects a Blob whose declared size exceeds the schedule cap", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const getReader = vi.fn(() => {
      throw new Error("oversized Blob stream must not be read");
    });
    mocks.get.mockResolvedValue({
      statusCode: 200,
      stream: { cancel, getReader },
      blob: { size: MAX_FOOD_TRUCK_SCHEDULE_BYTES + 1 },
    });

    await expect(readStoredFoodTruckSchedule()).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledWith(
      "Food-truck schedule exceeded its declared read limit",
    );
    expect(getReader).not.toHaveBeenCalled();
  });

  it("preserves the previous Blob when a serialized write exceeds the cap", async () => {
    const oversized = {
      ...valid,
      generatedAt: "2026-07-23T12:00:00.000Z",
      stops: [{
        ...valid.stops[0],
        title: "x".repeat(MAX_FOOD_TRUCK_SCHEDULE_BYTES),
      }],
    } as unknown as FoodTruckScheduleSnapshot;
    mocks.get.mockResolvedValue(blobResult(valid));

    await expect(
      writeFoodTruckSchedule(
        oversized,
        found(valid as unknown as FoodTruckScheduleSnapshot),
      ),
    ).resolves.toMatchObject({
      stored: false,
      preservedPrevious: true,
      reason: expect.stringContaining("storage limit"),
    });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("does not create a first snapshot when every source failed", async () => {
    const failed = {
      ...valid,
      stops: [],
      sources: [{
        id: "source",
        label: "Source",
        ok: false,
        count: 0,
        checkedAt: "2026-07-22T12:00:00.000Z",
      }],
    } as unknown as FoodTruckScheduleSnapshot;

    await expect(
      writeFoodTruckSchedule(failed, { status: "absent" }),
    ).resolves.toMatchObject({
      stored: false,
      preservedPrevious: false,
      reason: expect.stringContaining("All sources failed"),
    });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("stores failed-source health while retaining its last-known-good stop", async () => {
    const previous = {
      ...valid,
      stops: [{
        ...valid.stops[0],
        sourceId: "source",
        sourceName: "Source",
      }],
      sources: [{
        id: "source",
        label: "Source",
        ok: true,
        count: 1,
        checkedAt: "2026-07-22T12:00:00.000Z",
      }],
    } satisfies FoodTruckScheduleSnapshot;
    const failed = {
      ...valid,
      generatedAt: "2026-07-23T12:00:00.000Z",
      sources: [{
        id: "source",
        label: "Source",
        ok: false,
        count: 0,
        checkedAt: "2026-07-23T12:00:00.000Z",
        error: "HTTP 503",
      }],
      stops: [],
    } satisfies FoodTruckScheduleSnapshot;

    mocks.get.mockResolvedValue(blobResult(previous));
    await expect(writeFoodTruckSchedule(failed, found(previous))).resolves.toMatchObject({
      stored: true,
      preservedPrevious: true,
      reason: expect.stringContaining("1 last-known-good stop was retained"),
    });
    const stored = JSON.parse(mocks.put.mock.calls[0][1] as string) as FoodTruckScheduleSnapshot;
    expect(stored.stops).toHaveLength(1);
    expect(stored.sources[0]).toMatchObject({
      ok: false,
      retainedCount: 1,
      lastSuccessAt: "2026-07-22T12:00:00.000Z",
    });
  });

  it("does not resurrect a stop removed by a newer concurrent artifact", async () => {
    const staleInitial = {
      ...valid,
      stops: [{
        ...valid.stops[0],
        sourceId: "source",
        sourceName: "Source",
      }],
      sources: [{
        id: "source",
        label: "Source",
        ok: true,
        count: 1,
        checkedAt: "2026-07-22T12:00:00.000Z",
      }],
    } satisfies FoodTruckScheduleSnapshot;
    const concurrent = {
      ...staleInitial,
      generatedAt: "2026-07-23T12:00:00.000Z",
      stops: [],
      sources: [{
        id: "source",
        label: "Source",
        ok: true,
        count: 0,
        checkedAt: "2026-07-23T12:00:00.000Z",
      }],
    } satisfies FoodTruckScheduleSnapshot;
    const failed = {
      ...concurrent,
      generatedAt: "2026-07-24T12:00:00.000Z",
      sources: [{
        id: "source",
        label: "Source",
        ok: false,
        count: 0,
        checkedAt: "2026-07-24T12:00:00.000Z",
        error: "HTTP 503",
      }],
    } satisfies FoodTruckScheduleSnapshot;
    mocks.get.mockResolvedValue(blobResult(concurrent, '"concurrent-etag"'));

    await expect(
      writeFoodTruckSchedule(failed, found(staleInitial, '"stale-etag"')),
    ).resolves.toMatchObject({ stored: true });

    const stored = JSON.parse(
      mocks.put.mock.calls[0][1] as string,
    ) as FoodTruckScheduleSnapshot;
    expect(stored.stops).toEqual([]);
    expect(stored.sources[0]).toMatchObject({
      ok: false,
      previousCount: 0,
      retainedCount: 0,
    });
  });

  it("does not write when the current artifact cannot be verified", async () => {
    mocks.get.mockRejectedValue(new Error("timed out"));

    await expect(
      writeFoodTruckSchedule(valid, {
        status: "unavailable",
        reason: "Initial read timed out",
      }),
    ).resolves.toMatchObject({
      stored: false,
      preservedPrevious: true,
      reason: expect.stringContaining("could not be verified"),
    });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("does not let an older run overwrite a newer stored schedule", async () => {
    const older = {
      ...valid,
      generatedAt: "2026-07-22T11:00:00.000Z",
    } satisfies FoodTruckScheduleSnapshot;
    mocks.get.mockResolvedValue(blobResult(valid, '"newer-etag"'));

    await expect(
      writeFoodTruckSchedule(older, { status: "absent" }),
    ).resolves.toMatchObject({
      stored: false,
      preservedPrevious: true,
      superseded: true,
    });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("uses the latest ETag for an atomic overwrite", async () => {
    const next = {
      ...valid,
      generatedAt: "2026-07-23T12:00:00.000Z",
    } satisfies FoodTruckScheduleSnapshot;
    mocks.get.mockResolvedValue(blobResult(valid, '"current-etag"'));

    await expect(
      writeFoodTruckSchedule(next, found(valid, '"initial-etag"')),
    ).resolves.toMatchObject({ stored: true });

    expect(mocks.put).toHaveBeenCalledWith(
      FOOD_TRUCK_SCHEDULE_BLOB,
      expect.any(String),
      expect.objectContaining({
        allowOverwrite: true,
        ifMatch: '"current-etag"',
      }),
    );
  });

  it("acknowledges a newer winner after a conditional write conflict", async () => {
    const next = {
      ...valid,
      generatedAt: "2026-07-23T12:00:00.000Z",
    } satisfies FoodTruckScheduleSnapshot;
    const winner = {
      ...valid,
      generatedAt: "2026-07-23T12:01:00.000Z",
    } satisfies FoodTruckScheduleSnapshot;
    mocks.get
      .mockResolvedValueOnce(blobResult(valid, '"current-etag"'))
      .mockResolvedValueOnce(blobResult(winner, '"winner-etag"'));
    mocks.put.mockRejectedValueOnce(new Error("precondition failed"));

    await expect(
      writeFoodTruckSchedule(next, found(valid)),
    ).resolves.toMatchObject({
      stored: false,
      preservedPrevious: true,
      superseded: true,
    });
  });

  it("refuses to publish a schedule without any tracked sources", async () => {
    await expect(
      writeFoodTruckSchedule({ ...valid, sources: [] }, { status: "absent" }),
    ).resolves.toMatchObject({
      stored: false,
      reason: expect.stringContaining("No schedule sources"),
    });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("cancels a chunked stream that exceeds the schedule cap", async () => {
    let pulls = 0;
    let cancelled = false;
    const chunkSize = Math.floor(MAX_FOOD_TRUCK_SCHEDULE_BYTES / 2) + 1;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(chunkSize));
      },
      cancel() {
        cancelled = true;
      },
    });
    mocks.get.mockResolvedValue({
      statusCode: 200,
      stream,
      // A bad or stale length must not bypass the streaming limit.
      blob: { size: 1 },
    });

    await expect(readStoredFoodTruckSchedule()).resolves.toBeNull();
    expect(pulls).toBeLessThanOrEqual(3);
    expect(cancelled).toBe(true);
  });
});
