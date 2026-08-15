import "server-only";

import { createAbortDeadline } from "@/lib/promise-deadline";
import type {
  FoodTruckScheduleSnapshot,
  FoodTruckScheduleSourceHealth,
  FoodTruckScheduleStop,
} from "./schedule-types";

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

export type FoodTruckScheduleArtifactRead =
  | {
      status: "found";
      snapshot: FoodTruckScheduleSnapshot;
      /** Origin ETag used for an atomic compare-and-swap write. */
      etag: string;
    }
  | { status: "absent" }
  | { status: "unavailable"; reason: string };

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
    !Array.isArray(snapshot.sources) ||
    snapshot.sources.length === 0
  ) return false;

  const validOptionalCount = (count: unknown) =>
    count === undefined || (Number.isInteger(count) && Number(count) >= 0);
  const validOptionalBoolean = (flag: unknown) =>
    flag === undefined || typeof flag === "boolean";

  return snapshot.stops.every((stop) =>
    Boolean(
      stop &&
      isString(stop.id) &&
      (stop.sourceId === undefined || isString(stop.sourceId)) &&
      isString(stop.title) &&
      isString(stop.startsAt) &&
      isString(stop.venueName) &&
      isString(stop.sourceName) &&
      isString(stop.sourceUrl) &&
      Array.isArray(stop.vendors) &&
      stop.vendors.every((item) => item && isString(item.name)),
    ),
  ) && snapshot.sources.every((source) =>
    Boolean(
      source &&
      isString(source.id) &&
      isString(source.label) &&
      typeof source.ok === "boolean" &&
      Number.isInteger(source.count) &&
      source.count >= 0 &&
      isString(source.checkedAt) &&
      (source.lastSuccessAt === undefined || isString(source.lastSuccessAt)) &&
      validOptionalCount(source.previousCount) &&
      validOptionalCount(source.retainedCount) &&
      validOptionalBoolean(source.suspiciousZero) &&
      validOptionalBoolean(source.suspiciousDrop) &&
      (source.error === undefined || typeof source.error === "string"),
    ),
  );
}

function normalizedSourceLabel(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function sourceIdForStop(
  stop: FoodTruckScheduleStop,
  sources: readonly FoodTruckScheduleSourceHealth[],
): string | undefined {
  if (stop.sourceId) return stop.sourceId;
  const sourceName = normalizedSourceLabel(stop.sourceName);
  return sources.find(
    (source) => normalizedSourceLabel(source.label) === sourceName,
  )?.id;
}

function stopFallsInWindow(
  stop: FoodTruckScheduleStop,
  windowStart: string,
  windowEnd: string,
): boolean {
  const start = Date.parse(stop.startsAt);
  return Number.isFinite(start)
    && start >= Date.parse(windowStart)
    && start < Date.parse(windowEnd);
}

function lastSuccessfulCheck(
  source: FoodTruckScheduleSourceHealth | undefined,
): string | undefined {
  if (!source) return undefined;
  return source.lastSuccessAt ?? (source.ok ? source.checkedAt : undefined);
}

/**
 * Carry forward only the still-relevant stops owned by a source that failed or
 * returned a suspiciously incomplete refresh. A healthy, non-anomalous source
 * remains authoritative, including valid removals. This is idempotent so the
 * writer can enforce the rule even when a caller already reconciled the
 * snapshot for its response metrics.
 */
export function reconcileFoodTruckSchedule(
  next: FoodTruckScheduleSnapshot,
  previous: FoodTruckScheduleSnapshot | null,
): FoodTruckScheduleSnapshot {
  const previousSources = previous?.sources ?? [];
  const sourceUniverse = [...next.sources, ...previousSources];
  const currentStops = next.stops.map((stop) => {
    const sourceId = sourceIdForStop(stop, sourceUniverse);
    return sourceId && !stop.sourceId ? { ...stop, sourceId } : stop;
  });
  const publishedById = new Map(currentStops.map((stop) => [stop.id, stop]));

  const sources = next.sources.map((source): FoodTruckScheduleSourceHealth => {
    const previousSource = previousSources.find((item) => item.id === source.id);
    const previousStops = (previous?.stops ?? [])
      .filter((stop) => sourceIdForStop(stop, previousSources) === source.id)
      .filter((stop) => stopFallsInWindow(stop, next.windowStart, next.windowEnd));
    const previousCount = previousStops.length;
    const suspiciousZero = source.ok && previousCount > 0 && source.count === 0;
    const suspiciousDrop =
      source.ok
      && previousCount >= 3
      && source.count > 0
      && source.count <= previousCount * 0.6;
    const shouldRetainPrevious = !source.ok || suspiciousZero || suspiciousDrop;
    const publishedSourceStops = currentStops.filter(
      (stop) => sourceIdForStop(stop, sourceUniverse) === source.id,
    ).length;
    // A caller may already have reconciled this snapshot for response metrics.
    // Preserve that carry-forward count when the writer reconciles again at
    // the atomic write boundary.
    let retainedCount = Math.max(
      source.retainedCount ?? 0,
      Math.max(0, publishedSourceStops - source.count),
    );

    if (shouldRetainPrevious) {
      for (const stop of previousStops) {
        if (!publishedById.has(stop.id)) {
          publishedById.set(
            stop.id,
            stop.sourceId ? stop : { ...stop, sourceId: source.id },
          );
          retainedCount += 1;
        }
      }
      return {
        ...source,
        lastSuccessAt: source.ok
          ? source.checkedAt
          : lastSuccessfulCheck(previousSource),
        previousCount,
        retainedCount,
        suspiciousZero,
        suspiciousDrop,
      };
    }
    return {
      ...source,
      lastSuccessAt: source.checkedAt,
      previousCount,
      retainedCount: 0,
      suspiciousZero,
      suspiciousDrop,
    };
  });

  return {
    ...next,
    stops: [...publishedById.values()].sort(
      (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
    ),
    sources,
  };
}

/**
 * Operational Blob read that keeps "not found" separate from "could not
 * verify." Writers must use this result instead of treating every failure as a
 * first-run cache miss.
 */
export async function readStoredFoodTruckScheduleArtifact(
  {
    cacheMode = "origin-fresh",
    timeoutMs = DEFAULT_BLOB_READ_TIMEOUT_MS,
    signal,
  }: FoodTruckScheduleReadOptions = {},
): Promise<FoodTruckScheduleArtifactRead> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      status: "unavailable",
      reason: "Blob storage is not configured",
    };
  }
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
    if (!result) return { status: "absent" };
    if (result.statusCode !== 200 || !result.stream) {
      return {
        status: "unavailable",
        reason: "The stored food-truck schedule could not be read from Blob",
      };
    }
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
      return {
        status: "unavailable",
        reason: "The stored food-truck schedule exceeded its read limit",
      };
    }
    // Do not trust declared Blob metadata alone. Bound the actual stream too,
    // so a stale/malformed Content-Length cannot grow memory before JSON.parse.
    const value = await readBoundedJson(
      result.stream,
      MAX_FOOD_TRUCK_SCHEDULE_BYTES,
    );
    if (!isFoodTruckScheduleSnapshot(value) || !isString(result.blob.etag)) {
      return {
        status: "unavailable",
        reason: "The stored food-truck schedule is malformed",
      };
    }
    return { status: "found", snapshot: value, etag: result.blob.etag };
  } catch {
    return {
      status: "unavailable",
      reason: "The stored food-truck schedule read failed",
    };
  } finally {
    deadline.dispose();
  }
}

export async function readStoredFoodTruckSchedule(
  options: FoodTruckScheduleReadOptions = {},
): Promise<FoodTruckScheduleSnapshot | null> {
  const result = await readStoredFoodTruckScheduleArtifact(options);
  return result.status === "found" ? result.snapshot : null;
}

export type FoodTruckScheduleWriteResult = {
  stored: boolean;
  preservedPrevious: boolean;
  /** A newer concurrent run already won the atomic write. */
  superseded?: boolean;
  url?: string;
  reason?: string;
  /** Exact artifact stored or observed as the newer concurrent winner. */
  publishedSnapshot?: FoodTruckScheduleSnapshot;
};

function generatedAtMs(snapshot: FoodTruckScheduleSnapshot): number | null {
  const value = Date.parse(snapshot.generatedAt);
  return Number.isFinite(value) ? value : null;
}

function preservedResult(
  reason: string,
  superseded = false,
  publishedSnapshot?: FoodTruckScheduleSnapshot,
): FoodTruckScheduleWriteResult {
  return {
    stored: false,
    preservedPrevious: true,
    ...(superseded ? { superseded: true } : {}),
    ...(publishedSnapshot ? { publishedSnapshot } : {}),
    reason,
  };
}

/**
 * Persist a complete schedule atomically. A partial outage is never allowed to
 * replace a useful board with an empty one.
 */
export async function writeFoodTruckSchedule(
  next: FoodTruckScheduleSnapshot,
  initialRead: FoodTruckScheduleArtifactRead,
): Promise<FoodTruckScheduleWriteResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ...preservedResult("Blob storage is not configured"),
      preservedPrevious: initialRead.status !== "absent",
    };
  }
  if (next.sources.length === 0) {
    return preservedResult("No schedule sources were collected");
  }

  // Re-read at the write boundary. This lets a run that had a transient first
  // read failure recover safely, incorporates a concurrent run into
  // reconciliation, and supplies the ETag used for the atomic write below.
  const latestRead = await readStoredFoodTruckScheduleArtifact({
    cacheMode: "origin-fresh",
  });
  if (latestRead.status === "unavailable") {
    return preservedResult(
      `The previous schedule could not be verified before writing: ${latestRead.reason}`,
    );
  }

  const nextGeneratedAt = generatedAtMs(next);
  if (nextGeneratedAt === null) {
    return preservedResult("The new schedule has an invalid generated timestamp");
  }
  if (latestRead.status === "found") {
    const latestGeneratedAt = generatedAtMs(latestRead.snapshot);
    if (latestGeneratedAt === null) {
      return preservedResult(
        "The stored schedule has an invalid generated timestamp and was kept",
      );
    }
    if (latestGeneratedAt >= nextGeneratedAt) {
      return preservedResult(
        "A newer or equivalent food-truck schedule is already stored",
        true,
        latestRead.snapshot,
      );
    }
  }

  // The second origin read is authoritative. If the artifact disappeared
  // between reads, do not resurrect the stale initial copy.
  const previous = latestRead.status === "found" ? latestRead.snapshot : null;
  const publishable = reconcileFoodTruckSchedule(next, previous);
  const allSourcesFailed = publishable.sources.every((source) => !source.ok);
  if (allSourcesFailed && !previous) {
    return {
      stored: false,
      preservedPrevious: false,
      reason: "All sources failed; no schedule was stored",
    };
  }

  const serialized = JSON.stringify(publishable);
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
  let blob: Awaited<ReturnType<typeof put>>;
  try {
    blob = await put(FOOD_TRUCK_SCHEDULE_BLOB, serialized, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: latestRead.status === "found",
      ...(latestRead.status === "found" ? { ifMatch: latestRead.etag } : {}),
      cacheControlMaxAge: 60,
      contentType: "application/json",
    });
  } catch {
    // A conditional-write loser is expected during overlapping cron runs. Read
    // once more and acknowledge the winner only when its timestamp proves it
    // is at least as new as this run. Other failures remain retryable.
    const winner = await readStoredFoodTruckScheduleArtifact({
      cacheMode: "origin-fresh",
    });
    if (
      winner.status === "found"
      && generatedAtMs(winner.snapshot) !== null
      && (generatedAtMs(winner.snapshot) as number) >= nextGeneratedAt
    ) {
      return preservedResult(
        "A newer or equivalent concurrent food-truck schedule won the write",
        true,
        winner.snapshot,
      );
    }
    return preservedResult(
      "The food-truck schedule could not be written atomically",
    );
  }
  const retainedCount = publishable.sources.reduce(
    (total, source) => total + (source.retainedCount ?? 0),
    0,
  );
  return {
    stored: true,
    preservedPrevious: retainedCount > 0,
    url: blob.url,
    publishedSnapshot: publishable,
    ...(retainedCount > 0
      ? { reason: `${retainedCount} last-known-good stop${retainedCount === 1 ? " was" : "s were"} retained from failed or suspicious sources` }
      : {}),
  };
}
