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

export function countyStatusSnapshotLabel(summary: CountyStatusSummary, now = Date.now()): string {
  const age = now - Date.parse(summary.lastUpdated);
  if (!Number.isFinite(age) || age < -COUNTY_STATUS_FUTURE_TOLERANCE_MS || age >= COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS) return "Unable to verify";
  return countyStatusLabel(summary.level);
}
