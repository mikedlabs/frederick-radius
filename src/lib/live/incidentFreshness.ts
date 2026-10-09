import type { LiveIncidentSignal } from "./incidentSnapshot";

/** Existing public report occurrence window, shared by fusion and map views. */
export const RECENT_PUBLIC_REPORT_MS = 60 * 60_000;
/** Source check age is separate from the public report's occurrence age. */
export const SCANNER_SOURCE_CHECK_MAX_AGE_MS = 3 * 60_000;

export function countRecentPublicReports(items: readonly Pick<LiveIncidentSignal, "lastReportedAt">[], now: number): number {
  return items.filter((item) => {
    const age = now - Date.parse(item.lastReportedAt);
    return Number.isFinite(age) && age >= 0 && age <= RECENT_PUBLIC_REPORT_MS;
  }).length;
}
