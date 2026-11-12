/** Pure timing helpers for the plain event row. They live outside the
 * component so browser specs can read a row's facts without importing React. */

/** Splits a start clock such as "6:00 PM" so the numerals can carry the
 * column. Labels such as "All day" or "Time not listed" stay whole. */
export function eventRowClockParts(time: string): { clock: string; meridiem: string | null } {
  const match = /^(\d{1,2}:\d{2})\s?(AM|PM)$/i.exec(time.trim());
  return match ? { clock: match[1], meridiem: match[2].toUpperCase() } : { clock: time, meridiem: null };
}

/** The full timing line repeats the start clock. Keep only what it adds:
 * an end time, a started disclosure, or a missing-end caution. */
export function eventRowTimingNote(startTime: string, timing: string): string | null {
  if (!timing || timing === startTime) return null;
  if (timing.startsWith(`${startTime}–`)) return `Until ${timing.slice(startTime.length + 1)}`;
  if (timing.startsWith(`${startTime} · `)) {
    const rest = timing.slice(startTime.length + 3);
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return timing;
}
