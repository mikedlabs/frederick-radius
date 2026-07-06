/**
 * scrubTime — pure helpers for the /map time scrubber.
 *
 * The scrubber lets you drag through the day and watch the map re-evaluate
 * what's "on" at that hour. Kept framework-free so the window rule is
 * unit-testable and shared by the event filter (now) and the place
 * open/closed recompute (PR 2). Hours are 0-24 floats in Frederick (Eastern)
 * wall time; the caller extracts them from timestamps via @/lib/tz.
 */

/** 0-24 float hour-of-day from an Eastern {hour, minute}. */
export function easternHourFloat(parts: { hour: number; minute: number }): number {
  return parts.hour + parts.minute / 60;
}

/**
 * Should a same-day event show when the scrubber sits at `scrubHour`?
 * Visible from `lead` hours before it starts (so you see it coming) through
 * its end. An end at/least start (missing or malformed end, or a span past
 * midnight) is treated as running to end-of-day so it never vanishes early.
 */
export function withinScrubWindow(
  startHour: number,
  endHour: number,
  scrubHour: number,
  lead = 1.5,
): boolean {
  const end = endHour > startHour ? endHour : 24;
  return scrubHour >= startHour - lead && scrubHour < end;
}
