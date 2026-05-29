/**
 * Timezone correctness for event times.
 *
 * Frederick events are published as America/New_York wall-clock times.
 * The previous code built them with server-local Date methods, so on the
 * UTC production server a 5:00 PM event was stored as 17:00Z and rendered
 * four to five hours early. This converts an Eastern wall-clock time to
 * the correct UTC instant, DST-aware, with no dependency.
 */

/**
 * Given an America/New_York wall-clock time, return the matching UTC
 * instant as an ISO string. `month` is 1-based.
 *
 * Method: interpret the wall numbers as if they were UTC, ask what the
 * New York clock reads at that instant, and the difference is New York's
 * offset for that date. Apply it. Correct across the EDT and EST switch
 * for any event-hour time (not intended for the 2 AM transition itself).
 */
export function easternWallToUtcISO(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): string {
  const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(asUTC))
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asNY = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    second,
  );
  const offsetMs = asUTC - asNY;
  return new Date(asUTC + offsetMs).toISOString();
}

/**
 * The America/New_York calendar parts of an instant. Use this instead
 * of Date.getFullYear/getMonth/getDate/getDay (which read SERVER-local
 * time — UTC in production — and so put a late-evening Eastern event on
 * the wrong calendar day and compute the wrong day-of-week).
 * `month` is 1-based; `weekday` is 0=Sun…6=Sat.
 */
export function easternParts(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekday: number;
} {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      weekday: "short",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    weekday: WD[p.weekday] ?? 0,
  };
}

/** America/New_York calendar-day key ("YYYY-MM-DD") for an instant. */
export function easternDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
