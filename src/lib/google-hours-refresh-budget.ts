// A normal six-day hours bucket currently contains 208-273 Google-backed
// places (measured 2026-08-23). The default leaves a little growth and retry
// headroom for one complete bucket, while the immutable maximum can never
// exceed the route's 400-target batch safety limit. This is one shared Eastern
// calendar-day allowance: scheduled retries and authenticated cycleDay
// backfills spend from the same counter instead of reopening a per-run batch.
const DEFAULT_GOOGLE_HOURS_REFRESH_DAILY_CAP = 300;
const MIN_GOOGLE_HOURS_REFRESH_DAILY_CAP = 1;
const MAX_GOOGLE_HOURS_REFRESH_DAILY_CAP = 400;

export function googleHoursRefreshDailyCap(
  raw = process.env.GOOGLE_HOURS_REFRESH_DAILY_CAP,
): number {
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value)) {
    return DEFAULT_GOOGLE_HOURS_REFRESH_DAILY_CAP;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return DEFAULT_GOOGLE_HOURS_REFRESH_DAILY_CAP;
  }

  return Math.min(
    MAX_GOOGLE_HOURS_REFRESH_DAILY_CAP,
    Math.max(MIN_GOOGLE_HOURS_REFRESH_DAILY_CAP, parsed),
  );
}
