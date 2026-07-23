import "server-only";

import { get, put } from "@vercel/blob";
import type { FoodTruckScheduleSnapshot } from "./schedule-types";

export const FOOD_TRUCK_SCHEDULE_BLOB = "food-trucks/schedule-v1.json";

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
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

export async function readStoredFoodTruckSchedule(): Promise<FoodTruckScheduleSnapshot | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const result = await get(FOOD_TRUCK_SCHEDULE_BLOB, { access: "public", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const value: unknown = await new Response(result.stream).json();
    return isFoodTruckScheduleSnapshot(value) ? value : null;
  } catch {
    return null;
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

  const blob = await put(FOOD_TRUCK_SCHEDULE_BLOB, JSON.stringify(next), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
  });
  return { stored: true, preservedPrevious: false, url: blob.url };
}
