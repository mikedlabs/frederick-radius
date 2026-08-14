import type { Anomaly } from "@/lib/integrations/feed-snapshot";
import type { FoodTruckScheduleSnapshot } from "@/lib/food-trucks/schedule-types";

const MAX_SNAPSHOT_AGE_MS = 36 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export type FoodTruckScheduleHealth = {
  green: boolean;
  generatedAt: string | null;
  ageHours: number | null;
  stopCount: number;
  trackedSources: number;
  successfulSources: number;
  productiveSources: number;
  sourceCount: number;
  retainedStopCount: number;
  vendorMentions: number;
  canonicalVendorLinks: number;
  canonicalLinkRatePct: number | null;
  lastSuccessAt: string | null;
  failedSources: string[];
  suspiciousZeroSources: string[];
  suspiciousDropSources: string[];
  anomalies: Anomaly[];
};

function latestValidTimestamp(values: Array<string | undefined>): string | null {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, timestamp: Date.parse(value) }))
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp);
  return valid[0]?.value ?? null;
}

/**
 * Turn the cron-built food-truck board into the same explicit health signal as
 * the event feeds. A quiet week is valid; a missing/stale artifact, a named
 * source failure, or the unexplained loss of still-future rows is not. This
 * never treats zero published stops as evidence that no trucks are operating.
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
      trackedSources: 0,
      successfulSources: 0,
      productiveSources: 0,
      sourceCount: 0,
      retainedStopCount: 0,
      vendorMentions: 0,
      canonicalVendorLinks: 0,
      canonicalLinkRatePct: null,
      lastSuccessAt: null,
      failedSources: [],
      suspiciousZeroSources: [],
      suspiciousDropSources: [],
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
  const successfulSources = snapshot.sources.filter((source) => source.ok);
  const productiveSources = successfulSources.filter((source) => source.count > 0);
  const suspiciousZeroSources = snapshot.sources
    .filter((source) => source.suspiciousZero)
    .map((source) => source.label);
  const suspiciousDropSources = snapshot.sources
    .filter((source) => source.suspiciousDrop)
    .map((source) => source.label);
  const retainedStopCount = snapshot.sources.reduce(
    (total, source) => total + (source.retainedCount ?? 0),
    0,
  );
  const vendorMentions = snapshot.stops.reduce(
    (total, stop) => total + stop.vendors.length,
    0,
  );
  const canonicalVendorLinks = snapshot.stops.reduce(
    (total, stop) => total + stop.vendors.filter((vendor) => vendor.slug).length,
    0,
  );
  const canonicalLinkRatePct = vendorMentions > 0
    ? Number(((canonicalVendorLinks / vendorMentions) * 100).toFixed(1))
    : null;
  const lastSuccessAt = latestValidTimestamp(
    snapshot.sources.map((source) =>
      source.lastSuccessAt ?? (source.ok ? source.checkedAt : undefined)),
  );
  const anomalies: Anomaly[] = [];

  if (snapshot.sources.length === 0) {
    anomalies.push({
      source: "food-truck-schedule",
      kind: "live_source_failed",
      detail: "The stored food-truck schedule does not identify any tracked sources.",
    });
  }

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
  for (const source of snapshot.sources.filter((item) => item.suspiciousZero)) {
    anomalies.push({
      source: `food-truck:${source.id}`,
      kind: "empty_batch",
      detail: `${source.label} returned 0 stops, but its prior overlapping window had ${source.previousCount ?? 0}. Confirm that the schedule was intentionally cleared.`,
    });
  }
  for (const source of snapshot.sources.filter((item) => item.suspiciousDrop)) {
    anomalies.push({
      source: `food-truck:${source.id}`,
      kind: "count_drop",
      detail: `${source.label} fell from ${source.previousCount ?? 0} to ${source.count} stops in the overlapping schedule window.`,
    });
  }

  return {
    green:
      !stale
      && snapshot.sources.length > 0
      && failedSources.length === 0
      && suspiciousZeroSources.length === 0
      && suspiciousDropSources.length === 0,
    generatedAt: snapshot.generatedAt,
    ageHours,
    stopCount: snapshot.stops.length,
    trackedSources: snapshot.sources.length,
    successfulSources: successfulSources.length,
    productiveSources: productiveSources.length,
    sourceCount: snapshot.sources.length,
    retainedStopCount,
    vendorMentions,
    canonicalVendorLinks,
    canonicalLinkRatePct,
    lastSuccessAt,
    failedSources,
    suspiciousZeroSources,
    suspiciousDropSources,
    anomalies,
  };
}
