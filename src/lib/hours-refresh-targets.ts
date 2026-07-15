/** Pure selection logic for the paid rolling Google hours refresh. Keeping the
 * policy out of the route makes it difficult to silently omit an entire source
 * tier again. */

export const HOURS_REFRESH_CYCLE_DAYS = 7;

export function hoursRefreshCycleDay(slug: string): number {
  let h = 5381;
  for (let i = 0; i < slug.length; i++) {
    h = ((h * 33) ^ slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % HOURS_REFRESH_CYCLE_DAYS;
}

export function selectHoursRefreshTargets<
  T extends { slug: string; google_place_id?: string | null },
>(places: readonly T[], cycleDay: number, cap: number): T[] {
  if (!Number.isInteger(cycleDay) || cycleDay < 0 || cycleDay >= HOURS_REFRESH_CYCLE_DAYS) {
    throw new RangeError(`cycleDay must be 0-${HOURS_REFRESH_CYCLE_DAYS - 1}`);
  }
  if (!Number.isInteger(cap) || cap < 1) throw new RangeError("cap must be positive");

  // One paid lookup per Google identity. Sort first so duplicates always pick
  // the same canonical slug regardless of source-array order, then bucket the
  // deduplicated set so a place is refreshed exactly once per cycle.
  const byGoogleId = new Map<string, T>();
  for (const place of [...places].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (place.google_place_id && !byGoogleId.has(place.google_place_id)) {
      byGoogleId.set(place.google_place_id, place);
    }
  }

  return [...byGoogleId.values()]
    .filter((place) => hoursRefreshCycleDay(place.slug) === cycleDay)
    .slice(0, cap);
}
