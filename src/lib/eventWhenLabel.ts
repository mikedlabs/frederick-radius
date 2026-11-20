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
    // Some engines print midnight as "24" under hour12:false.
    hour: value("hour") % 24,
    minute: value("minute"),
    second: value("second"),
  };
}

const HOUR_MS = 3_600_000;

/** 11:58 PM or later on the Eastern clock. */
function isEndOfDayClock(date: Date): boolean {
  const clock = easternClock(date);
  return clock.hour === 23 && clock.minute >= 58;
}

/**
 * Several public calendars use 11:59 PM as a placeholder for "no end time."
 * It is not evidence that a morning program is still running at night, and
 * it is not evidence that an evening meeting runs to midnight either: the
 * county calendar printed "Council Legislative Day 5:30 PM-11:59 PM" and
 * "Ethics Commission Meeting 6:30 PM-11:59 PM" (UI audit, Oct 2026). An
 * earlier ten-hour floor let every short evening row through, so any
 * same-day end at 11:58 PM or later is now the placeholder, whatever the
 * duration. A real event that ends right at midnight is published as
 * 12:00 AM, which this rule leaves alone.
 *
 * The same placeholder also arrives one hour late, as 12:58-12:59 AM on the
 * next Eastern day, when a publisher writes 11:59 PM in the wrong offset
 * ("Kid Creator Fall Market 12:00 PM-Mon 12:59 AM").
 */
export function eventHasEndOfDaySentinel(e: EventTiming): boolean {
  if (e.is_all_day || !e.ends_at) return false;
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() <= start.getTime()
  ) {
    return false;
  }
  const startDay = easternDayKey(start);
  if (easternDayKey(end) === startDay) return isEndOfDayClock(end);
  // Shift back one hour: 12:59 AM becomes 11:59 PM on the start's own day.
  // DST changes happen at 2 AM, so this hour never crosses a transition.
  const shifted = new Date(end.getTime() - HOUR_MS);
  return easternDayKey(shifted) === startDay && isEndOfDayClock(shifted);
}

/** The 11:59 PM placeholder on the start's own Eastern day. */
function hasSameDayEndOfDaySentinel(e: EventTiming): boolean {
  return (
    eventHasEndOfDaySentinel(e) &&
    easternDayKey(new Date(e.starts_at)) ===
      easternDayKey(new Date(e.ends_at as string))
  );
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

/** Noon plus an end-of-day sentinel is a date anchor, not a noon start.
 *  Only the same-day form qualifies: a shifted 12:59 AM end says the feed's
 *  offset is wrong, so its noon start is not the familiar date placeholder. */
export function isDateOnlyEventAnchor(e: EventTiming): boolean {
  if (!hasSameDayEndOfDaySentinel(e)) return false;
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

/** When a feed gives no real end (ends_at missing, equal to starts_at, or the
 *  11:59 PM placeholder), grant this long a runtime before declaring the
 *  event over: a 7 PM show with no duration shouldn't read as "ended" at
 *  7:01, and a 5:30 PM hearing shouldn't read as current at 10:50 PM. */
export const ASSUMED_RUNTIME_MS = 3 * HOUR_MS;

/** Cap on how long a single session may ride a STATED end. Feeds stamp
 *  end-of-day (or venue-close) ends on short daytime shows, so a 1-4 PM act
 *  tagged "ends 11:59 PM" read "Live now" AND kept riding the /today rail all
 *  evening (owner catch, Jul 2026). Eight hours covers any real single
 *  session; past that the stated end lies more often than it informs. */
export const MAX_LIVE_SESSION_MS = 8 * 3_600_000;

/** The visibility end for a TIMED event: its stated end when later than the
 *  start and not an end-of-day placeholder, else a 3h grace, but never more
 *  than MAX_LIVE_SESSION_MS past the start. This grace keeps an unknown-end
 *  event discoverable briefly; it is deliberately NOT enough evidence to call
 *  that event "Live now."
 *
 *  A date-only anchor (noon plus 11:59 PM) has no clock at all, so a runtime
 *  measured from its placeholder noon would hide a listed date mid-afternoon.
 *  It keeps its capped stated window. */
export function effectiveTimedEventEndMs(e: {
  starts_at: string;
  ends_at?: string | null;
}): number {
  const start = Date.parse(e.starts_at);
  const stated = statedEndBoundsVisibility(e)
    ? Date.parse(e.ends_at as string)
    : start + ASSUMED_RUNTIME_MS;
  return Math.min(stated, start + MAX_LIVE_SESSION_MS);
}

/** May the stated end bound how long this event stays current or upcoming?
 *  It must be later than the start and not the 11:59 PM placeholder, except
 *  on a date-only anchor, whose placeholder honestly marks the listed day. */
export function statedEndBoundsVisibility(e: EventTiming): boolean {
  const start = Date.parse(e.starts_at);
  const end = e.ends_at ? Date.parse(e.ends_at) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return false;
  }
  return !eventHasEndOfDaySentinel(e) || isDateOnlyEventAnchor(e);
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
 *   - a timed event ends at its effective end (real end capped at 8h, or a
 *     3h assumed runtime when the feed gives no real end), so a noon show
 *     with an end-of-day stamp finally demotes to "Earlier today" instead of
 *     riding the live rail until midnight.
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
