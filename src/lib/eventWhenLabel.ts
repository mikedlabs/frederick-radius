import { easternDayKey, easternParts } from "@/lib/tz";

type EventTiming = {
  starts_at: string;
  ends_at?: string | null;
  is_all_day?: boolean;
};

const EASTERN_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const EASTERN_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function easternClock(date: Date): {
  hour: number;
  minute: number;
  second: number;
} {
  const parts = EASTERN_CLOCK.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

/**
 * Several public calendars use 11:59 PM as a placeholder for "no end time."
 * It is not evidence that a morning program is still running at night.
 */
export function eventHasEndOfDaySentinel(e: EventTiming): boolean {
  if (e.is_all_day || !e.ends_at) return false;
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() <= start.getTime() ||
    easternDayKey(start) !== easternDayKey(end)
  ) {
    return false;
  }
  const clock = easternClock(end);
  const looksLikeEndOfDay = clock.hour === 23 && clock.minute >= 58;
  const durationMs = end.getTime() - start.getTime();
  return looksLikeEndOfDay && durationMs >= 10 * 60 * 60 * 1000;
}

/** A real, usable end-time claim rather than a missing, zero, or sentinel end. */
export function eventHasTrustworthyEnd(e: EventTiming): boolean {
  if (!e.ends_at) return false;
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() <= start.getTime()
  ) {
    return false;
  }
  if (e.is_all_day) return true;
  return !eventHasEndOfDaySentinel(e);
}

/** Noon plus an end-of-day sentinel is a date anchor, not a noon start. */
export function isDateOnlyEventAnchor(e: EventTiming): boolean {
  if (!eventHasEndOfDaySentinel(e)) return false;
  const start = easternClock(new Date(e.starts_at));
  return start.hour === 12 && start.minute === 0 && start.second === 0;
}

/**
 * Honest disclosure for a timed event that has begun without a usable end.
 * The Events board receives a server-captured clock, so this stays stable
 * across hydration instead of consulting Date.now() inside a card.
 */
export function startedEventTimingDisclosure(
  e: EventTiming,
  now: Date,
): string | null {
  if (e.is_all_day || eventHasTrustworthyEnd(e) || isDateOnlyEventAnchor(e)) {
    return null;
  }
  const start = new Date(e.starts_at);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(now.getTime()) ||
    start.getTime() > now.getTime()
  ) {
    return null;
  }
  return `Started at ${EASTERN_TIME.format(start)} · end time unavailable`;
}

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

/** The visibility end for a TIMED event: its stated end when later than the
 *  start, else a 2h grace, but never more than MAX_LIVE_SESSION_MS past the
 *  start. This grace keeps an unknown-end event discoverable briefly; it is
 *  deliberately NOT enough evidence to call that event "Live now." */
export function effectiveTimedEventEndMs(e: {
  starts_at: string;
  ends_at?: string | null;
}): number {
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
 *   - all-day events with a valid exclusive end remain current until that
 *     instant (including every day of a multi-day span); legacy rows without a
 *     usable end fall back to their Eastern start day;
 *   - a timed event ends at its effective end (real end, capped at 8h), so a
 *     noon show with an end-of-day stamp finally demotes to "Earlier today"
 *     instead of riding the live rail until midnight.
 */
export function isEventEnded(
  e: { starts_at: string; ends_at?: string | null; is_all_day?: boolean },
  now: Date,
): boolean {
  if (e.is_all_day) {
    const start = Date.parse(e.starts_at);
    const end = e.ends_at ? Date.parse(e.ends_at) : NaN;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return now.getTime() >= end;
    }
    return easternDayKey(new Date(e.starts_at)) < easternDayKey(now);
  }
  return effectiveTimedEventEndMs(e) < now.getTime();
}

/**
 * Is this event plausibly happening THIS MINUTE? The shared gate for every
 * "Live now" badge/set (loaders eventsLive, event-reasons chip, the
 * horizon's Happening-now bucket). Stricter than !isEventEnded on purpose:
 *  - all-day rows are "today", never "live" (a feed's all-day event spans
 *    midnight-to-midnight; the 3 AM audit found Senior Yoga "live");
 *  - a stated end is trusted only up to MAX_LIVE_SESSION_MS after start,
 *    so end-of-day/range stamps can't keep a noon event live at 11 PM;
 *  - no/invalid/zero/sentinel duration is never promoted to live. It may stay
 *    visible briefly with an explicit "end time unavailable" disclosure, but
 *    a guessed runtime cannot support a live claim.
 */
export function isEventLiveNow(
  e: EventTiming,
  now: Date,
): boolean {
  if (e.is_all_day || !eventHasTrustworthyEnd(e)) return false;
  const start = Date.parse(e.starts_at);
  if (!Number.isFinite(start) || start > now.getTime()) return false;
  return now.getTime() < effectiveTimedEventEndMs(e);
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
