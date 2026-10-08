export type CountyStatusLevel = "Urgent" | "Advisory" | "Clear" | "Unknown";
export type CountyStatusSummary = {
  active: boolean;
  count: number;
  tone: "alert" | "caution" | "quiet";
  ok: boolean;
  level: CountyStatusLevel;
  /** Assembly time, not the time every publisher was checked. */
  lastUpdated: string;
};

export function countyStatusLabel(level: CountyStatusLevel): string {
  return level === "Clear" ? "Clear in checked feeds" : level;
}


export const COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS = (300 + 60) * 1000;
export const COUNTY_STATUS_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export function countyStatusSnapshotLabel(summary: CountyStatusSummary, now = Date.now()): string {
  const age = now - Date.parse(summary.lastUpdated);
  if (!Number.isFinite(age) || age < -COUNTY_STATUS_FUTURE_TOLERANCE_MS || age >= COUNTY_STATUS_MAX_SNAPSHOT_AGE_MS) return "Unknown";
  return countyStatusLabel(summary.level);
}
