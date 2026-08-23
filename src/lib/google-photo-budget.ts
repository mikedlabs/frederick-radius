const DEFAULT_GOOGLE_PHOTO_DAILY_CAP = 50;
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
