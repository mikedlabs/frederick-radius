/**
 * Google event geocoding is a last-resort enrichment path after official and
 * cached coordinates. Keep its default deliberately small, and make the code
 * ceiling immutable so an accidental environment edit cannot create an
 * unbounded bill. An explicit zero is the operational kill switch.
 */
export const DEFAULT_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT = 25;
export const MAX_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT = 100;

export function googleEventGeocodeDailyLimit(
  raw: string | number | undefined =
    process.env.GOOGLE_EVENT_GEOCODE_DAILY_LIMIT,
): number {
  if (raw === undefined || raw === "") {
    return DEFAULT_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT;
  }
  const parsed = typeof raw === "number" ? raw : Number(raw.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return DEFAULT_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT;
  }
  return Math.min(parsed, MAX_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT);
}
