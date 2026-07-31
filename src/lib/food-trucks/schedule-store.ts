import "server-only";

import { createAbortDeadline } from "@/lib/promise-deadline";
import type { FoodTruckScheduleSnapshot } from "./schedule-types";

export const FOOD_TRUCK_SCHEDULE_BLOB = "food-trucks/schedule-v1.json";
export const MAX_FOOD_TRUCK_SCHEDULE_BYTES = 512 * 1024;
const DEFAULT_BLOB_READ_TIMEOUT_MS = 5_000;
const MAX_BLOB_READ_TIMEOUT_MS = 8_000;

export type FoodTruckScheduleReadOptions = {
  /**
   * Public surfaces may use the Blob CDN because the cron invalidates those
   * pages after a successful write. Cron and operational reads retain the
   * origin-fresh behavior that existed before cached surface reads were added.
   */
  cacheMode?: "cache-first" | "origin-fresh";
  timeoutMs?: number;
  signal?: AbortSignal;
};

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

async function readBoundedJson(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel("Food-truck schedule exceeded its read limit");
        return null;
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return JSON.parse(chunks.join(""));
  } finally {
    reader.releaseLock();
  }
}

/** Reject malformed or partial cache files before they reach the page. */
export function isFoodTruckScheduleSnapshot(value: unknown): value is FoodTruckScheduleSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<FoodTruckScheduleSnapshot>;
  if (
    snapshot.version !== 1 ||
    !isString(snapshot.generatedAt) ||
    !isString(snapshot.windowStart) ||
    !isString(snapshot.windowEnd) ||
    !Array.isArray(snapshot.stops) ||
    !Array.isArray(snapshot.sources)
  ) return false;

  return snapshot.stops.every((stop) =>
    Boolean(
      stop &&
      isString(stop.id) &&
      isString(stop.title) &&
      isString(stop.startsAt) &&
      isString(stop.venueName) &&
      isString(stop.sourceName) &&
      isString(stop.sourceUrl) &&
      Array.isArray(stop.vendors) &&
      stop.vendors.every((item) => item && isString(item.name)),
    ),
  );
}

export async function readStoredFoodTruckSchedule(
  {
    cacheMode = "origin-fresh",
    timeoutMs = DEFAULT_BLOB_READ_TIMEOUT_MS,
    signal,
  }: FoodTruckScheduleReadOptions = {},
): Promise<FoodTruckScheduleSnapshot | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const boundedTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.min(Math.floor(timeoutMs), MAX_BLOB_READ_TIMEOUT_MS)
      : DEFAULT_BLOB_READ_TIMEOUT_MS;
  const deadline = createAbortDeadline(boundedTimeoutMs, signal);
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(FOOD_TRUCK_SCHEDULE_BLOB, {
      access: "public",
      useCache: cacheMode === "cache-first",
      abortSignal: deadline.signal,
    });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    if (
      !Number.isFinite(result.blob.size) ||
      result.blob.size < 0 ||
      result.blob.size > MAX_FOOD_TRUCK_SCHEDULE_BYTES
    ) {
      try {
        await result.stream.cancel(
          "Food-truck schedule exceeded its declared read limit",
        );
      } catch {
        // The response is already being discarded. A stream implementation
        // that refuses cancellation must not turn malformed cache data into a
        // page failure.
      }
      return null;
    }
    // Do not trust declared Blob metadata alone. Bound the actual stream too,
    // so a stale/malformed Content-Length cannot grow memory before JSON.parse.
    const value = await readBoundedJson(
      result.stream,
      MAX_FOOD_TRUCK_SCHEDULE_BYTES,
    );
    return isFoodTruckScheduleSnapshot(value) ? value : null;
  } catch {
    return null;
  } finally {
    deadline.dispose();
  }
}

export type FoodTruckScheduleWriteResult = {
  stored: boolean;
  preservedPrevious: boolean;
  url?: string;
  reason?: string;
};

/**
 * Persist a complete schedule atomically. A partial outage is never allowed to
 * replace a useful board with an empty one.
 */
export async function writeFoodTruckSchedule(
  next: FoodTruckScheduleSnapshot,
  previous: FoodTruckScheduleSnapshot | null,
): Promise<FoodTruckScheduleWriteResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { stored: false, preservedPrevious: Boolean(previous), reason: "Blob storage is not configured" };
  }
  const hasFailedSource = next.sources.some((source) => !source.ok);
  if (hasFailedSource && next.stops.length === 0 && (previous?.stops.length ?? 0) > 0) {
    return { stored: false, preservedPrevious: true, reason: "Sources degraded; the last valid schedule was kept" };
  }

  const serialized = JSON.stringify(next);
  if (
    new TextEncoder().encode(serialized).byteLength >
    MAX_FOOD_TRUCK_SCHEDULE_BYTES
  ) {
    return {
      stored: false,
      preservedPrevious: Boolean(previous),
      reason: previous
        ? "Schedule exceeded the storage limit; the previous version was kept"
        : "Schedule exceeded the storage limit and was not stored",
    };
  }

  const { put } = await import("@vercel/blob");
  const blob = await put(FOOD_TRUCK_SCHEDULE_BLOB, serialized, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
  });
  return { stored: true, preservedPrevious: false, url: blob.url };
}
