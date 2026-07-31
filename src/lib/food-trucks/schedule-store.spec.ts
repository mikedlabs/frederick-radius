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
  readStoredFoodTruckSchedule,
  writeFoodTruckSchedule,
} from "./schedule-store";
import type { FoodTruckScheduleSnapshot } from "./schedule-types";

const previousBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

describe("food-truck schedule cache validation", () => {
  const valid = {
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
    sources: [],
  };

  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mocks.get.mockReset();
    mocks.put.mockReset();
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

  it("uses the Blob CDN for cache-first surface reads", async () => {
    const payload = JSON.stringify(valid);
    mocks.get.mockResolvedValue({
      statusCode: 200,
      stream: new Response(payload).body,
      blob: { size: new TextEncoder().encode(payload).byteLength },
    });

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
      generatedAt: "x".repeat(MAX_FOOD_TRUCK_SCHEDULE_BYTES),
    } as unknown as FoodTruckScheduleSnapshot;

    await expect(
      writeFoodTruckSchedule(
        oversized,
        valid as unknown as FoodTruckScheduleSnapshot,
      ),
    ).resolves.toMatchObject({
      stored: false,
      preservedPrevious: true,
      reason: expect.stringContaining("storage limit"),
    });
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
