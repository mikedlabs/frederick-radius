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
