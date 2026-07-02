import { easternDayKey } from "@/lib/tz";

/**
 * Honest "when" label for an event relative to now, in America/New_York.
 *
 * The /today hero + the "best move" card lead with the soonest worthwhile
 * event, which the page picks from a 72-HOUR window — so a Wednesday show
 * was being labeled "Tonight" just because the user opened the page in the
 * evening (the label keyed off the time-of-day band, not the event's date).
 * This labels by the event's REAL Eastern day:
 *   - same day  → "Tonight" in the evening/late band, else "Today"
 *   - next day  → "Tomorrow"
 *   - 2-3 days  → the weekday name ("Friday")
 */
export function isEventToday(startsAtIso: string, now: Date): boolean {
  return easternDayKey(new Date(startsAtIso)) === easternDayKey(now);
}

/** When a feed gives no real end (ends_at missing or equal to starts_at),
 *  grant this long a runtime before declaring the event over — a 7 PM show
 *  with no duration shouldn't read as "ended" at 7:01. */
const ASSUMED_RUNTIME_MS = 2 * 3_600_000;

/**
 * Has this event provably finished?
 *
 * The /today surfaces group by START day, which is right for "what's on
 *  today" but let ALREADY-ENDED afternoon events keep ranking ahead of a
 * live evening draw (the 7:55 PM audit render led with 2-4 PM library
 * crafts while a Keys game was live). This is the shared floor:
 *   - all-day events end with their Eastern calendar day, never mid-day;
 *   - a real ends_at (later than the start) is trusted as-is;
 *   - no/zero duration gets ASSUMED_RUNTIME_MS of benefit-of-the-doubt.
 */
export function isEventEnded(
  e: { starts_at: string; ends_at?: string; is_all_day?: boolean },
  now: Date,
): boolean {
  if (e.is_all_day) {
    return easternDayKey(new Date(e.starts_at)) < easternDayKey(now);
  }
  const start = Date.parse(e.starts_at);
  const rawEnd = e.ends_at ? Date.parse(e.ends_at) : NaN;
  const end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + ASSUMED_RUNTIME_MS;
  return end < now.getTime();
}

export function eventWhenLabel(
  startsAtIso: string,
  now: Date,
  isEveningBand: boolean,
): string {
  const start = new Date(startsAtIso);
  const startKey = easternDayKey(start);
  if (startKey === easternDayKey(now)) return isEveningBand ? "Tonight" : "Today";
  // +24h real time always lands on the next Eastern calendar day (DST
  // transitions happen at 2am, nowhere near the midnight boundary).
  const tomorrow = new Date(now.getTime() + 24 * 3_600_000);
  if (startKey === easternDayKey(tomorrow)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(start);
}
