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
import { easternParts, easternWallToUtcISO } from "@/lib/tz";

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
  } else {
    // "Live" requires the event to have actually STARTED. The curated live-set
    // (b.live) may override an unreliable or missing END time, but it must NEVER
    // force a FUTURE event live — that's what let an upstream feed's mis-dated
    // occurrence (a far-future instance) render "Happening now". So the gate is:
    // started AND (still running OR flagged live). A future start can never match.
    if (start <= b.now && (end >= b.now || b.live.has(e.slug))) return "live";
    if (end < b.now) return null; // over, and not live → not upcoming
  }

  if (start >= b.now && start < b.next24) return "today";
  if (start >= b.weekendStart && start < b.weekendEnd) return "weekend";

  const weekEnd = b.now + 7 * 24 * 60 * 60 * 1000;
  if (start >= b.now && start < weekEnd) return "week";
  return "later";
}

export type EventGroup<E> = { key: Horizon; label: string; events: E[] };

const ORDER: Horizon[] = ["live", "today", "weekend", "week", "later"];

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
  return ORDER.filter((k) => byKey.has(k)).map((k) => ({
    key: k,
    label: HORIZON_LABEL[k],
    events: byKey.get(k)!,
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
