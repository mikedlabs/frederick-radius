import { easternDayKey, easternParts } from "@/lib/tz";

/**
 * Honest "when" label for an event relative to now, in America/New_York.
 *
 * The /today hero + the "best move" card lead with the soonest worthwhile
 * event, which the page picks from a 72-HOUR window — so a Wednesday show
 * was being labeled "Tonight" just because the user opened the page in the
 * evening (the label keyed off the time-of-day band, not the event's date).
 * This labels by the event's REAL Eastern day AND its own clock:
 *   - same day  → "Tonight" when the EVENT starts in the evening (≥5 PM),
 *                 else "Today" (a noon reading is never "Tonight", no
 *                 matter what hour the reader opens the page — the 4:18 AM
 *                 audit render stamped TONIGHT on a 12 PM event because the
 *                 label keyed off the viewer's late band)
 *   - next day  → "Tomorrow"
 *   - 2-3 days  → the weekday name ("Friday")
 */
export function isEventToday(startsAtIso: string, now: Date): boolean {
  return easternDayKey(new Date(startsAtIso)) === easternDayKey(now);
}

/** When a feed gives no real end (ends_at missing or equal to starts_at),
 *  grant this long a runtime before declaring the event over: a 7 PM show
 *  with no duration shouldn't read as "ended" at 7:01. */
const ASSUMED_RUNTIME_MS = 2 * 3_600_000;

/** Cap on how long a single session may ride a STATED end. Feeds stamp
 *  end-of-day (or venue-close) ends on short daytime shows, so a 1-4 PM act
 *  tagged "ends 11:59 PM" read "Live now" AND kept riding the /today rail all
 *  evening (owner catch, Jul 2026). Eight hours covers any real single
 *  session; past that the stated end lies more often than it informs. */
export const MAX_LIVE_SESSION_MS = 8 * 3_600_000;

/** The end we trust for a TIMED event: its stated end when later than the
 *  start, else a 2h assumed runtime, but never more than MAX_LIVE_SESSION_MS
 *  past the start. Shared by isEventEnded and isEventLiveNow so a started
 *  event is one or the other, never both. That symmetry is the fix: this
 *  cap used to live only in isEventLiveNow, so isEventEnded trusted an
 *  inflated end verbatim and a finished afternoon show never demoted. */
function trustedEndMs(e: { starts_at: string; ends_at?: string }): number {
  const start = Date.parse(e.starts_at);
  const rawEnd = e.ends_at ? Date.parse(e.ends_at) : NaN;
  const stated =
    Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + ASSUMED_RUNTIME_MS;
  return Math.min(stated, start + MAX_LIVE_SESSION_MS);
}

/**
 * Has this event provably finished?
 *
 * The /today surfaces group by START day, which is right for "what's on
 * today" but let ALREADY-ENDED afternoon events keep ranking ahead of a
 * live evening draw (the 7:55 PM audit render led with 2-4 PM library
 * crafts while a Keys game was live). This is the shared floor:
 *   - all-day events end with their Eastern calendar day, never mid-day;
 *   - a timed event ends at its trustedEndMs (real end, capped at 8h), so a
 *     noon show with an end-of-day stamp finally demotes to "Earlier today"
 *     instead of riding the live rail until midnight.
 */
export function isEventEnded(
  e: { starts_at: string; ends_at?: string; is_all_day?: boolean },
  now: Date,
): boolean {
  if (e.is_all_day) {
    return easternDayKey(new Date(e.starts_at)) < easternDayKey(now);
  }
  return trustedEndMs(e) < now.getTime();
}

/**
 * Is this event plausibly happening THIS MINUTE? The shared gate for every
 * "Live now" badge/set (loaders eventsLive, event-reasons chip, the
 * horizon's Happening-now bucket). Stricter than !isEventEnded on purpose:
 *  - all-day rows are "today", never "live" (a feed's all-day event spans
 *    midnight-to-midnight; the 3 AM audit found Senior Yoga "live");
 *  - a stated end is trusted only up to MAX_LIVE_SESSION_MS after start,
 *    so end-of-day/range stamps can't keep a noon event live at 11 PM;
 *  - no/invalid/zero duration gets the same ASSUMED_RUNTIME_MS grace
 *    isEventEnded grants.
 */
export function isEventLiveNow(
  e: { starts_at: string; ends_at?: string; is_all_day?: boolean },
  now: Date,
): boolean {
  if (e.is_all_day) return false;
  const start = Date.parse(e.starts_at);
  if (!Number.isFinite(start) || start > now.getTime()) return false;
  return now.getTime() < trustedEndMs(e);
}

/** An event is a "tonight" event only when IT starts in the Eastern
 *  evening. 5 PM matches the shared daypart evening boundary. */
const EVENING_START_HOUR = 17;

export function eventWhenLabel(startsAtIso: string, now: Date): string {
  const start = new Date(startsAtIso);
  const startKey = easternDayKey(start);
  if (startKey === easternDayKey(now)) {
    return easternParts(start).hour >= EVENING_START_HOUR ? "Tonight" : "Today";
  }
  // +24h real time always lands on the next Eastern calendar day (DST
  // transitions happen at 2am, nowhere near the midnight boundary).
  const tomorrow = new Date(now.getTime() + 24 * 3_600_000);
  if (startKey === easternDayKey(tomorrow)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(start);
}
