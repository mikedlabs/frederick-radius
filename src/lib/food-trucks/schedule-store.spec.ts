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
    vi.clearAllTimers();
    vi.useRealTimers();
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

  it("bounds a get that ignores cancellation and consumes its late rejection", async () => {
    vi.useFakeTimers();
    let rejectGet!: (reason: Error) => void;
    let observedSignal: AbortSignal | undefined;
    mocks.get.mockImplementation((_pathname, options) => {
      observedSignal = options.abortSignal;
      return new Promise((_resolve, reject) => { rejectGet = reject; });
    });
    const completed = vi.fn();
    void readStoredFoodTruckSchedule({ timeoutMs: 25 }).then(completed);
    try {
      await vi.advanceTimersByTimeAsync(25);
      expect(observedSignal?.aborted).toBe(true);
      expect(completed).toHaveBeenCalledExactlyOnceWith(null);
      rejectGet(new Error("late SDK failure"));
      await vi.advanceTimersByTimeAsync(0);
      expect(completed).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      rejectGet?.(new Error("test cleanup"));
    }
  });

  it("cancels a late SDK stream without reading it or changing the settled result", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn().mockRejectedValue(new Error("late cleanup rejected"));
    const getReader = vi.fn(() => { throw new Error("late bytes must not be parsed"); });
    const late = { statusCode: 200, stream: { cancel, getReader }, blob: { size: 1 } };
    let finishGet!: (value: typeof late) => void;
    mocks.get.mockImplementation(() => new Promise((resolve) => { finishGet = resolve; }));
    const completed = vi.fn();
    void readStoredFoodTruckSchedule({ timeoutMs: 25 }).then(completed);
    try {
      await vi.advanceTimersByTimeAsync(25);
      expect(completed).toHaveBeenCalledExactlyOnceWith(null);
      finishGet(late);
      await vi.advanceTimersByTimeAsync(0);
      expect(cancel).toHaveBeenCalledOnce();
      expect(getReader).not.toHaveBeenCalled();
      expect(completed).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      finishGet?.(late);
    }
  });

  it("bounds stalled body reads even when stream cancellation never settles", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream<Uint8Array>({ pull() {}, cancel });
    mocks.get.mockResolvedValue({ statusCode: 200, stream, blob: { size: 1 } });
    const completed = vi.fn();
    void readStoredFoodTruckSchedule({ timeoutMs: 25 }).then(completed);
    await vi.advanceTimersByTimeAsync(25);
    expect(completed).toHaveBeenCalledExactlyOnceWith(null);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not wait for cancellation of an oversized declared Blob", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const getReader = vi.fn(() => { throw new Error("oversized stream must not be read"); });
    mocks.get.mockResolvedValue({ statusCode: 200, stream: { cancel, getReader }, blob: { size: MAX_FOOD_TRUCK_SCHEDULE_BYTES + 1 } });
    const completed = vi.fn();
    void readStoredFoodTruckSchedule({ timeoutMs: 25 }).then(completed);
    await vi.advanceTimersByTimeAsync(0);
    expect(completed).toHaveBeenCalledExactlyOnceWith(null);
    expect(cancel).toHaveBeenCalledOnce();
    expect(getReader).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the actual byte limit when its cancellation promise hangs", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    let pulls = 0;
    const chunk = new Uint8Array(Math.floor(MAX_FOOD_TRUCK_SCHEDULE_BYTES / 2) + 1);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; controller.enqueue(chunk); },
      cancel,
    });
    mocks.get.mockResolvedValue({ statusCode: 200, stream, blob: { size: 1 } });
    const completed = vi.fn();
    void readStoredFoodTruckSchedule({ timeoutMs: 25 }).then(completed);
    await vi.advanceTimersByTimeAsync(0);
    expect(completed).toHaveBeenCalledExactlyOnceWith(null);
    expect(cancel).toHaveBeenCalledOnce();
    expect(pulls).toBeLessThanOrEqual(3);
    expect(stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not initialize Blob for an already-aborted parent", async () => {
    const controller = new AbortController();
    controller.abort();
    mocks.get.mockResolvedValue(null);
    await expect(readStoredFoodTruckSchedule({ signal: controller.signal })).resolves.toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("settles on parent abort and removes its listener and timer", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    mocks.get.mockReturnValue(new Promise(() => {}));
    const completed = vi.fn();
    void readStoredFoodTruckSchedule({ timeoutMs: 1_000, signal: controller.signal }).then(completed);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(completed).toHaveBeenCalledExactlyOnceWith(null);
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up the deadline after an ordinary unchanged successful snapshot", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    const payload = JSON.stringify(valid);
    mocks.get.mockResolvedValue({ statusCode: 200, stream: new Response(payload).body, blob: { size: payload.length } });
    await expect(readStoredFoodTruckSchedule({ timeoutMs: 25, signal: controller.signal })).resolves.toEqual(valid);
    expect(controller.signal.aborted).toBe(false);
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([[50_000, 8_000], [0, 5_000]])("retains the existing timeout clamp for %s", async (timeoutMs, expectedMs) => {
    vi.useFakeTimers();
    mocks.get.mockReturnValue(new Promise(() => {}));
    const completed = vi.fn();
    void readStoredFoodTruckSchedule({ timeoutMs }).then(completed);
    await vi.advanceTimersByTimeAsync(expectedMs - 1);
    expect(completed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(completed).toHaveBeenCalledExactlyOnceWith(null);
    expect(vi.getTimerCount()).toBe(0);
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

  it("does not publish an empty snapshot when every source failed", async () => {
    const failed = {
      ...valid,
      stops: [],
      sources: [{ id: "source", name: "Source", ok: false }],
    } as unknown as FoodTruckScheduleSnapshot;

    await expect(
      writeFoodTruckSchedule(
        failed,
        valid as unknown as FoodTruckScheduleSnapshot,
      ),
    ).resolves.toMatchObject({
      stored: false,
      preservedPrevious: true,
      reason: expect.stringContaining("All sources failed"),
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
  it("bounds stalled SDK initialization and never starts a late get", async () => {
    vi.useFakeTimers();
    let finishImport!: (module: typeof mocks) => void;
    vi.resetModules();
    vi.doMock("@vercel/blob", () => new Promise<typeof mocks>((resolve) => { finishImport = resolve; }));
    const { readStoredFoodTruckSchedule: readWithFreshModule } = await import("./schedule-store");
    const completed = vi.fn();
    void readWithFreshModule({ timeoutMs: 25 }).then(completed);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(finishImport).toBeTypeOf("function");
      await vi.advanceTimersByTimeAsync(25);
      expect(completed).toHaveBeenCalledExactlyOnceWith(null);
      finishImport(mocks);
      await vi.advanceTimersByTimeAsync(0);
      expect(mocks.get).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      finishImport?.(mocks);
      await vi.advanceTimersByTimeAsync(0);
      vi.doMock("@vercel/blob", () => mocks);
    }
  });


});
