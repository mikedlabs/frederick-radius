// 25/day remains below the current 1,000-request monthly free allowance in a
// 31-day month. Production can lower this further, while the immutable maximum
// prevents an accidental environment edit from reopening the original spend.
const DEFAULT_GOOGLE_PHOTO_DAILY_CAP = 25;
const MIN_GOOGLE_PHOTO_DAILY_CAP = 1;
const MAX_GOOGLE_PHOTO_DAILY_CAP = 100;

/**
 * One shared ceiling for every Google photo-media fetch, including public
 * image requests and the server-side health probe. Keeping the resolver out of
 * either call site prevents a second Google path from silently using a larger
 * allowance against the same usage-counter row.
 */
export function googlePhotoDailyCap(
  raw = process.env.GOOGLE_PHOTO_DAILY_CAP,
): number {
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value)) return DEFAULT_GOOGLE_PHOTO_DAILY_CAP;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return DEFAULT_GOOGLE_PHOTO_DAILY_CAP;

  return Math.min(
    MAX_GOOGLE_PHOTO_DAILY_CAP,
    Math.max(MIN_GOOGLE_PHOTO_DAILY_CAP, parsed),
  );
}
