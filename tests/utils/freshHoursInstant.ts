import HOURS from "@/data/places-client-hours.json" with { type: "json" };

/**
 * A test instant that is always valid against the COMMITTED hours data.
 *
 * Open-status tests broke as literal pinned dates drifted out of the
 * hours-freshness window (HOURS_MAX_AGE_DAYS = 7, plus the future-stamp
 * corruption guard): any refresh of places-client-hours.json newer than a
 * spec's literal date makes most stamps read as "future" and drop, and any
 * spec date more than seven days past the stamps makes them read as stale
 * and drop. Both directions silently empty the open-now pool (issue #1529).
 *
 * This helper derives the pinned clock from the data instead: the first
 * requested weekday at the requested UTC hour ON OR AFTER the newest
 * committed stamp. With a healthy daily refresh the newest stamp is recent,
 * the derived instant lands within a day or two of it, and every stamp that
 * is at most a few days older stays inside the freshness window.
 */
export function freshHoursInstant(
  weekdayUtc: number, // 0 = Sunday … 6 = Saturday
  hourUtc: number,
): Date {
  const stamps = (HOURS as Array<{ hours_updated_at?: string }>)
    .map((row) => Date.parse(row.hours_updated_at ?? ""))
    .filter((t) => Number.isFinite(t));
  const newest = stamps.length > 0 ? Math.max(...stamps) : Date.now();
  const candidate = new Date(newest);
  candidate.setUTCHours(hourUtc, 0, 0, 0);
  while (
    candidate.getUTCDay() !== weekdayUtc ||
    candidate.getTime() < newest
  ) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}
