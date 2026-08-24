// This is a hard spike breaker, not the app's normal photo target. The live
// counter's 30-day p95 was 1,285 attempts/day on 2026-08-23; 1,500 therefore
// preserves ordinary browsing while bounding a bot, retry loop, or accidental
// eager render. Lowering this sharply would make legitimate business imagery
// disappear late in the day. Reduce normal usage by replacing high-traffic
// Google media with owned/licensed photos, not by silently degrading the UI.
const DEFAULT_GOOGLE_PHOTO_DAILY_CAP = 1_500;
const MIN_GOOGLE_PHOTO_DAILY_CAP = 1;
const MAX_GOOGLE_PHOTO_DAILY_CAP = 2_000;

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
