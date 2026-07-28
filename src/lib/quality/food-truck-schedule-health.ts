import type { Anomaly } from "@/lib/integrations/feed-snapshot";
import type { FoodTruckScheduleSnapshot } from "@/lib/food-trucks/schedule-types";

const MAX_SNAPSHOT_AGE_MS = 36 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export type FoodTruckScheduleHealth = {
  green: boolean;
  generatedAt: string | null;
  ageHours: number | null;
  stopCount: number;
  sourceCount: number;
  failedSources: string[];
  anomalies: Anomaly[];
};

/**
 * Turn the cron-built food-truck board into the same explicit health signal as
 * the event feeds. A quiet week is valid; a missing/stale artifact or a named
 * source failure is not. This reads source health only and never treats zero
 * published stops as evidence that no trucks are operating.
 */
export function evaluateFoodTruckScheduleHealth(
  snapshot: FoodTruckScheduleSnapshot | null,
  now = new Date(),
): FoodTruckScheduleHealth {
  if (!snapshot) {
    return {
      green: false,
      generatedAt: null,
      ageHours: null,
      stopCount: 0,
      sourceCount: 0,
      failedSources: [],
      anomalies: [{
        source: "food-truck-schedule",
        kind: "snapshot_expired",
        detail: "No stored food-truck schedule is available. Check the Vercel schedule cron and Blob token.",
      }],
    };
  }

  const generatedMs = Date.parse(snapshot.generatedAt);
  const ageMs = now.getTime() - generatedMs;
  const validTimestamp = Number.isFinite(generatedMs);
  const implausiblyFuture =
    validTimestamp && generatedMs > now.getTime() + MAX_FUTURE_SKEW_MS;
  const ageHours = validTimestamp
    ? Math.max(0, ageMs / (60 * 60 * 1000))
    : null;
  const stale =
    !validTimestamp ||
    implausiblyFuture ||
    ageMs > MAX_SNAPSHOT_AGE_MS;
  const failedSources = snapshot.sources
    .filter((source) => !source.ok)
    .map((source) => source.label);
  const anomalies: Anomaly[] = [];

  if (stale) {
    anomalies.push({
      source: "food-truck-schedule",
      kind: "snapshot_expired",
      detail: !validTimestamp
        ? "The stored food-truck schedule has an invalid generated timestamp."
        : implausiblyFuture
          ? "The stored food-truck schedule has a generated timestamp more than 5 minutes in the future."
          : `The stored food-truck schedule is ${(ageHours ?? 0).toFixed(1)} hours old (limit 36 hours).`,
    });
  }
  for (const source of snapshot.sources.filter((item) => !item.ok)) {
    anomalies.push({
      source: `food-truck:${source.id}`,
      kind: "live_source_failed",
      detail: source.error
        ? `${source.label} failed: ${source.error}`
        : `${source.label} failed during the latest food-truck refresh.`,
    });
  }

  return {
    green: !stale && failedSources.length === 0,
    generatedAt: snapshot.generatedAt,
    ageHours,
    stopCount: snapshot.stops.length,
    sourceCount: snapshot.sources.length,
    failedSources,
    anomalies,
  };
}
