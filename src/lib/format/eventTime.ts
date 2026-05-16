/**
 * The single source of truth for rendering event times.
 *
 * Frederick events are stored as UTC instants (see lib/tz.ts for the
 * storage spine). Every user-facing event time must render in
 * America/New_York, never in UTC or browser-local time. The previous bug
 * was the Events list rendering the correct UTC instant without a
 * timezone, so it showed four hours early.
 *
 * Built from Intl parts so the output is stable ASCII ("8:00 PM" with a
 * normal space), independent of the ICU version's AM/PM separator.
 */

export const EVENT_TZ = "America/New_York";

function nyParts(iso: string): Record<string, string> {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(iso))) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out;
}

/** "8:00 PM" in America/New_York. */
export function formatEventTime(iso: string): string {
  const p = nyParts(iso);
  return `${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()}`;
}

/** "Sat, May 16" in America/New_York. */
export function formatEventDate(iso: string): string {
  const p = nyParts(iso);
  return `${p.weekday}, ${p.month} ${p.day}`;
}

/**
 * The display building blocks for a single event, all in
 * America/New_York. Use this for chip layouts that stack the month and
 * day separately.
 */
export function eventDateParts(iso: string): {
  weekdayShort: string;
  monthShort: string;
  monthShortUpper: string;
  day: string;
  time: string;
} {
  const p = nyParts(iso);
  return {
    weekdayShort: p.weekday,
    monthShort: p.month,
    monthShortUpper: p.month.toUpperCase(),
    day: p.day,
    time: `${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()}`,
  };
}
