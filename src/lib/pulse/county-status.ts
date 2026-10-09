export type CountyStatusLevel = "Urgent" | "Advisory" | "Clear" | "Unknown";
export type CountySourceCheck = {
  source: string;
  state: "current" | "stale" | "unavailable" | "disabled";
  asOf: string | null;
  asOfBasis: "retrieval" | "provider" | "observation" | null;
};
export type CountyStatusSummary = {
  active: boolean;
  count: number;
  tone: "alert" | "caution" | "quiet";
  ok: boolean;
  level: CountyStatusLevel;
  /** Assembly time, not the time every publisher was checked. */
  lastUpdated: string;
  /** Earliest accepted source/alert expiry. Legacy reports without a deadline are unverified. */
  validUntil?: string | null;
  checks?: CountySourceCheck[];
  roadCheck?: {
    verified: boolean;
    checkedAt: string | null;
    currentCount: number;
    earlierCount: number;
    unverifiedSources: string[];
  };
};

export function countyStatusLabel(level: CountyStatusLevel): string {
  return level === "Clear" ? "Clear in checked feeds" : level === "Unknown" ? "Unable to verify" : level;
}


export const COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS = (300 + 60) * 1000;
export const COUNTY_STATUS_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** A source deadline may be shorter than the maximum assembly age. */
export function countyStatusSnapshotDeadline(summary: CountyStatusSummary): number | null {
  const assembled = Date.parse(summary.lastUpdated);
  const sourceDeadline = Date.parse(summary.validUntil ?? "");
  if (!Number.isFinite(assembled) || !Number.isFinite(sourceDeadline)) return null;
  return Math.min(assembled + COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS, sourceDeadline);
}

export function countyStatusSnapshotLabel(summary: CountyStatusSummary, now = Date.now()): string {
  const age = now - Date.parse(summary.lastUpdated);
  const deadline = countyStatusSnapshotDeadline(summary);
  if (!Number.isFinite(age) || age < -COUNTY_STATUS_FUTURE_TOLERANCE_MS || deadline === null || now >= deadline) return "Unable to verify";
  return countyStatusLabel(summary.level);
}
