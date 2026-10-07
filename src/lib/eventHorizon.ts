/**
 * eventHorizon.ts — group events into human time horizons.
 *
 * A flat list "ordered by date and time" is technically correct and
 * completely unreadable: you cannot tell at a glance what is on tonight
 * vs next month, so it reads as a directory you get lost in. People —
 * a kid, a grandparent — think in "now / today / this weekend", not in
 * a 400-row chronological scroll. This turns the same events into those
 * buckets so the shape is obvious before you read a single title.
 *
 * Pure and unit-tested: every boundary is injected (no hidden clock),
 * so it is deterministic and runs identically on server and client.
 */
import { easternDayKey, easternParts, easternWallToUtcISO } from "@/lib/tz";
import {
  effectiveTimedEventEndMs,
  isEventEnded,
  isEventLiveNow,
} from "@/lib/eventWhenLabel";

export type Horizon = "live" | "today" | "weekend" | "week" | "later";

export const HORIZON_LABEL: Record<Horizon, string> = {
  live: "Happening now",
  // "Today", not "Today & tonight": callers pass `next24` = end of today
  // (next Eastern midnight), so this bucket is today only and the label
  // can't quietly include tomorrow's events (the audit flagged that the
  // old rolling +24h window let "Today & tonight" spill into tomorrow).
  today: "Today",
  weekend: "This weekend",
  week: "Later this week",
  later: "Coming up",
};

export type HorizonBounds = {
  /** ms — the current instant. */
  now: number;
  /** ms — end of the "today" bucket: callers pass the next Eastern
   *  midnight, so "today" never includes tomorrow. (Field name is
   *  historical; the value is end-of-today, not a rolling +24h.) */
  next24: number;
  /** ms — Friday 5pm of the upcoming weekend. */
  weekendStart: number;
  /** ms — Monday 0:00 after that weekend. */
  weekendEnd: number;
  /** Slugs the live feed says are happening right now. */
  live: ReadonlySet<string>;
};

type EventLike = { slug: string; starts_at: string; ends_at: string; is_all_day?: boolean };

/**
 * A window longer than this is a date-RANGE listing, not a clock-time event:
 * a months-long exhibit, or a recurring series a feed flattens into one
 * first-day → last-day row (Visit Frederick models weekly trivia as a single
 * multi-YEAR window). 36h keeps genuine late-night single events (an evening
 * that runs past midnight) out of the range bucket.
 */
export const RANGE_LISTING_MS = 36 * 3_600_000;
/**
 * A range that opened months ago and still claims to be "coming up" is almost
 * always a recurring feed flattened into one first-occurrence → final-
 * occurrence row. Keep real short courses and current exhibits, but retire
 * stale ranges whose opening is more than four months behind the user.
 */
export const RANGE_LISTING_STALE_AFTER_MS = 120 * 24 * 3_600_000;

/** True for a non-all-day row whose start→end window exceeds RANGE_LISTING_MS. */
export function isRangeListing(e: {
  starts_at: string;
  ends_at: string;
  is_all_day?: boolean;
}): boolean {
  return (
    !e.is_all_day &&
    Date.parse(e.ends_at) - Date.parse(e.starts_at) > RANGE_LISTING_MS
  );
}

/**
 * Detail pages keep a current date-range listing actionable until its real
 * end, subject to the same stale-range guard as the Events board. This is
 * listing availability, not evidence of continuous opening or a live session.
 * Ordinary timed and all-day events retain their existing lifecycle rules.
 */
export function isEventListingEnded(
  e: { starts_at: string; ends_at: string; is_all_day?: boolean },
  now: Date,
): boolean {
  if (isRangeListing(e)) {
    return (
      Date.parse(e.ends_at) <= now.getTime() ||
      now.getTime() - Date.parse(e.starts_at) > RANGE_LISTING_STALE_AFTER_MS
    );
  }
  return isEventEnded(e, now);
}

/**
 * The horizon a single event belongs to. First match wins, in the
 * order live → today → weekend → week → later. Past events (already
 * ended and not live) return null so the caller can drop them.
 */
export function horizonOf<E extends EventLike>(
  e: E,
  b: HorizonBounds,
): Horizon | null {
  const start = +new Date(e.starts_at);
  const end = +new Date(e.ends_at);

  // ALL-DAY rows never read as "live": a feed's all-day event starts at
  // midnight and spans the whole day, so the old gate kept it in
  // "Happening now" through the middle of the night (the 3 AM audit found
  // Senior Yoga "live"). While its day lasts it belongs under "today" —
  // EventCard already prints "All day" for the time.
  if (e.is_all_day) {
    if (start <= b.now && end >= b.now) return "today";
    if (end < b.now) return null;
    // future all-day event: fall through to the dated buckets below.
  } else if (end - start > RANGE_LISTING_MS) {
    // Date-RANGE listings: "started AND not ended" holds for the entire
    // span, so the live gate below kept every in-progress range in
    // "Happening now" wearing its first-day date — 18 Visit Frederick
    // series/exhibits squatted there labelled "Thu JAN 29 · 12:00 PM"
    // (owner-reported, Jul 2). A bare range carries no next-occurrence, so
    // the only honest placement while it runs is the undated shelf: Coming
    // up (the card prints "through <end>", see eventDateBlock). A range
    // OPENING today or later still earns its dated bucket — opening day is
    // a real date claim — via the fall-through below.
    if (end < b.now) return null;
    if (
      start <= b.now &&
      b.now - start > RANGE_LISTING_STALE_AFTER_MS
    ) {
      return null;
    }
    if (start <= b.now) return "later";
    // future range: fall through to the dated buckets on its opening day.
  } else {
    // "Live" requires a started event AND a usable end time that still lies in
    // the future. A live-set flag is not allowed to overrule missing, equal,
    // invalid, or end-of-day-sentinel data: those rows remain discoverable for
    // a bounded period, but their cards disclose "end time unavailable"
    // instead of making an unsupported live claim.
    const liveUntil = effectiveTimedEventEndMs(e);
    if (isEventLiveNow(e, new Date(b.now))) return "live";
    if (liveUntil < b.now) return null; // over, and not live → not upcoming
    if (start <= b.now) {
      // An event that started today but has no trustworthy end stays under
      // Today while its bounded visibility window is open. It must never fall
      // into Coming up: that would present an already-started event as future.
      return easternDayKey(new Date(start)) === easternDayKey(new Date(b.now))
        ? "today"
        : null;
    }
  }

  if (start >= b.now && start < b.next24) return "today";
  if (start >= b.weekendStart && start < b.weekendEnd) return "weekend";

  const weekEnd = b.now + 7 * 24 * 60 * 60 * 1000;
  const weekendIsNow = b.now >= b.weekendStart && b.now < b.weekendEnd;
  // Keep semantic shelves chronological. Before the weekend, "Later this
  // week" ends when the weekend begins; dates after that belong in Coming up.
  // During the weekend, the same seven-day window is correctly "Next week."
  if (
    start >= b.now &&
    start < weekEnd &&
    (weekendIsNow || start < b.weekendStart)
  ) {
    return "week";
  }
  return "later";
}

export type EventGroup<E> = { key: Horizon; label: string; events: E[] };

/**
 * The weekend is a future horizon Monday through Thursday, but it is the
 * immediate horizon Friday evening through Sunday. A fixed order put
 * "This weekend" (Fri-Sun) before "Later this week" (Tue-Thu) on a Monday.
 */
function horizonOrder(b: HorizonBounds): Horizon[] {
  const weekendIsNow = b.now >= b.weekendStart && b.now < b.weekendEnd;
  return weekendIsNow
    ? ["live", "today", "weekend", "week", "later"]
    : ["live", "today", "week", "weekend", "later"];
}

/**
 * Partition events into ordered, non-empty horizon groups. Within each
 * group the original (already date-sorted) order is preserved, so
 * "Today & tonight" still reads earliest-first. Σ group sizes ≤ input
 * (past, non-live events are dropped) — every surfaced event lands in
 * exactly one group.
 */
export function groupByHorizon<E extends EventLike>(
  events: E[],
  b: HorizonBounds,
): EventGroup<E>[] {
  const byKey = new Map<Horizon, E[]>();
  for (const e of events) {
    const h = horizonOf(e, b);
    if (!h) continue;
    const arr = byKey.get(h);
    if (arr) arr.push(e);
    else byKey.set(h, [e]);
  }
  return horizonOrder(b).filter((k) => byKey.has(k)).map((k) => ({
    key: k,
    label:
      k === "week" && b.now >= b.weekendStart && b.now < b.weekendEnd
        ? "Next week"
        : HORIZON_LABEL[k],
    events: byKey.get(k)!,
  }));
}

/**
 * "Tonight" as a local means it: from 4 PM until 4 AM Eastern. The local day
 * turns over at 4 AM, so at 1 AM the night still in progress is yesterday's
 * evening and "Tomorrow" is the coming daytime, not the day after it. The old
 * Tonight chip was Today plus the 4-9 PM daypart, which went empty at 9 PM and
 * told an 11 PM visitor nothing was on while a 10 PM set was still playing.
 */
export const NIGHT_START_HOUR = 16;
export const NIGHT_END_HOUR = 4;

/** A half-open [start, end) span of instants, in ms. */
export type InstantWindow = { start: number; end: number };

type EasternDate = { year: number; month: number; day: number };

/** The Eastern calendar date `days` after `base`, walked via noon UTC so
 *  month/year rollover and DST stay correct (mirrors buildHorizonBounds). */
function shiftEasternDate(base: EasternDate, days: number): EasternDate {
  const p = easternParts(new Date(Date.UTC(base.year, base.month - 1, base.day + days, 12)));
  return { year: p.year, month: p.month, day: p.day };
}

/** The Eastern date whose evening `now` belongs to (yesterday before 4 AM). */
function eveningDate(now: Date): EasternDate {
  const p = easternParts(now);
  const today = { year: p.year, month: p.month, day: p.day };
  return p.hour < NIGHT_END_HOUR ? shiftEasternDate(today, -1) : today;
}

/** The 4 PM to 4 AM night `dayOffset` nights after the current one. */
export function nightWindow(now: Date, dayOffset = 0): InstantWindow {
  const first = shiftEasternDate(eveningDate(now), dayOffset);
  const next = shiftEasternDate(first, 1);
  return {
    start: Date.parse(easternWallToUtcISO(first.year, first.month, first.day, NIGHT_START_HOUR, 0)),
    end: Date.parse(easternWallToUtcISO(next.year, next.month, next.day, NIGHT_END_HOUR, 0)),
  };
}

/** Eastern "YYYY-MM-DD" key for the local day after tonight's evening. */
export function tomorrowDayKey(now: Date): string {
  const d = shiftEasternDate(eveningDate(now), 1);
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

type TimedLike = { starts_at: string; ends_at: string; is_all_day?: boolean };

/**
 * One Tonight rule for every surface: a timed listing that has not ended and
 * either starts inside tonight's 4 PM to 4 AM window or, once the evening has
 * begun, is still running from earlier. All-day rows and in-progress date
 * ranges make no claim about the evening, so they stay out.
 */
export function isTonightEvent(e: TimedLike, nowMs: number): boolean {
  if (e.is_all_day) return false;
  const start = Date.parse(e.starts_at);
  if (!Number.isFinite(start)) return false;
  const night = nightWindow(new Date(nowMs));
  if (isRangeListing(e)) {
    return start >= night.start && start < night.end && Date.parse(e.ends_at) > nowMs;
  }
  if (isEventEnded(e, new Date(nowMs))) return false;
  if (start >= night.start && start < night.end) return true;
  return nowMs >= night.start && start <= nowMs;
}

/** Listings that start on tomorrow's Eastern day and have not ended. A date
 *  range already open before tomorrow makes no claim about that day. */
export function isTomorrowEvent(e: TimedLike, nowMs: number): boolean {
  const start = Date.parse(e.starts_at);
  if (!Number.isFinite(start)) return false;
  if (easternDayKey(new Date(start)) !== tomorrowDayKey(new Date(nowMs))) return false;
  if (isRangeListing(e)) return Date.parse(e.ends_at) > nowMs;
  return !isEventEnded(e, new Date(nowMs));
}

/** Timed listings that start during tomorrow's 4 PM to 4 AM evening. */
export function isTomorrowEveningEvent(e: TimedLike, nowMs: number): boolean {
  if (e.is_all_day) return false;
  const start = Date.parse(e.starts_at);
  if (!Number.isFinite(start)) return false;
  const night = nightWindow(new Date(nowMs), 1);
  return start >= night.start && start < night.end;
}

export type DayGroup<E> = { key: string; label: string; events: E[] };

/**
 * Group an already-ordered list under Eastern calendar-day subheads, days in
 * chronological order and the caller's order kept inside each day. Labels are
 * "Today", "Tomorrow", then "Friday, October 9".
 */
export function groupByEasternDay<E extends { starts_at: string }>(
  events: E[],
  nowMs: number,
): DayGroup<E>[] {
  const now = new Date(nowMs);
  const todayKey = easternDayKey(now);
  const p = easternParts(now);
  const next = shiftEasternDate({ year: p.year, month: p.month, day: p.day }, 1);
  const nextKey = `${next.year}-${String(next.month).padStart(2, "0")}-${String(next.day).padStart(2, "0")}`;
  const byDay = new Map<string, E[]>();
  for (const e of events) {
    const start = new Date(e.starts_at);
    if (!Number.isFinite(start.getTime())) continue;
    const key = easternDayKey(start);
    const arr = byDay.get(key);
    if (arr) arr.push(e);
    else byDay.set(key, [e]);
  }
  return [...byDay.keys()].sort().map((key) => ({
    key,
    label:
      key === todayKey
        ? "Today"
        : key === nextKey
          ? "Tomorrow"
          : new Intl.DateTimeFormat("en-US", {
              timeZone: "America/New_York",
              weekday: "long",
              month: "long",
              day: "numeric",
            }).format(new Date(`${key}T16:00:00Z`)),
    events: byDay.get(key)!,
  }));
}

/**
 * Build the horizon time-bounds for an instant, in America/New_York wall
 * time. THE weekend-window fix lives here: when today is Fri/Sat/Sun the
 * weekend the user is standing in CONTAINS today, instead of the old
 * `daysToFri = (5 - weekday + 7) % 7` math that jumped to NEXT Friday the
 * moment it was already the weekend (so a Saturday saw next weekend, never
 * the one it was in). Centralized so every surface reads one correct window
 * and the bug can't reappear per-page. `now` is injected (no hidden clock),
 * so this stays deterministic + unit-testable like the rest of the module.
 */
export function buildHorizonBounds(
  now: Date,
  live: ReadonlySet<string> = new Set(),
): HorizonBounds {
  const et = easternParts(now);
  // Days from THIS weekend's Friday: Fri=0, Sat=1, Sun=2, Mon=3 … Thu=6.
  const daysFromFri = (et.weekday - 5 + 7) % 7;
  // Fri/Sat/Sun: the weekend's Friday is `daysFromFri` days BEHIND today, so
  // the window contains today. Mon-Thu: the upcoming Friday is ahead. This
  // one line is the Sat/Sun next-weekend fix.
  const friOffset = daysFromFri <= 2 ? -daysFromFri : 7 - daysFromFri;
  // Walk the Eastern calendar via noon-UTC dates re-read as Eastern parts so
  // month/year rollover stays correct (mirrors eventsWeekend()).
  const friBase = easternParts(new Date(Date.UTC(et.year, et.month - 1, et.day + friOffset, 12)));
  const monBase = easternParts(new Date(Date.UTC(et.year, et.month - 1, et.day + friOffset + 3, 12)));
  const endBase = easternParts(new Date(Date.UTC(et.year, et.month - 1, et.day + 1, 12)));
  return {
    now: +now,
    next24: Date.parse(easternWallToUtcISO(endBase.year, endBase.month, endBase.day, 0, 0)),
    weekendStart: Date.parse(easternWallToUtcISO(friBase.year, friBase.month, friBase.day, 17, 0)),
    weekendEnd: Date.parse(easternWallToUtcISO(monBase.year, monBase.month, monBase.day, 0, 0)),
    live,
  };
}
