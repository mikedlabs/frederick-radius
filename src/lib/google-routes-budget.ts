// Live usage was 106 matrix elements over 30 days with a 36-element peak on
// 2026-08-23. A 100-element default leaves ample room for real explicit taps;
// the immutable 160-element maximum keeps a 31-day worst case below the
// current 5,000-element monthly free allowance for the more expensive Pro SKU.
const DEFAULT_GOOGLE_ROUTES_DAILY_ELEMENT_CAP = 100;
const MIN_GOOGLE_ROUTES_DAILY_ELEMENT_CAP = 1;
const MAX_GOOGLE_ROUTES_DAILY_ELEMENT_CAP = 160;

export function googleRoutesDailyElementCap(
  raw = process.env.GOOGLE_ROUTES_DAILY_ELEMENT_CAP,
): number {
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value)) {
    return DEFAULT_GOOGLE_ROUTES_DAILY_ELEMENT_CAP;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return DEFAULT_GOOGLE_ROUTES_DAILY_ELEMENT_CAP;
  }

  return Math.min(
    MAX_GOOGLE_ROUTES_DAILY_ELEMENT_CAP,
    Math.max(MIN_GOOGLE_ROUTES_DAILY_ELEMENT_CAP, parsed),
  );
}
