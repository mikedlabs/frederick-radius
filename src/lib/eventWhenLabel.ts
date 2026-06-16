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
