/**
 * The "ticket stub" — the vertical date stub torn off the left of an event
 * card (the chosen "clever card" treatment for events). It gives events a
 * silhouette that reads differently from a place card at a glance: a big
 * MON / 07 stub, a perforated edge, then the event body.
 *
 * Pure and now-injectable so the "today vs later" branch unit-tests without
 * wall-clock flake. All formatting is America/New_York — the app's whole
 * calendar is county-local, never the viewer's zone.
 */
const TZ = "America/New_York";

export type StubDate = {
  /** "JUL" — short month for the stub, already uppercased. */
  month: string;
  /** "07" — day of month, zero-padded so the stub is a stable width. */
  day: string;
  /** "Mon" — short weekday. */
  weekday: string;
  /** "6:00 PM" — start time, county-local. */
  time: string;
  /** True within the [-3h, +24h] "happening around now" window — lets the
   *  surface swap the date eyebrow for a live "Today · 6 PM" read. */
  soon: boolean;
};

function part(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts }).format(d);
}

export function ticketStubDate(startsAtISO: string, now: Date = new Date()): StubDate {
  const start = new Date(startsAtISO);
  const msUntil = start.getTime() - now.getTime();
  const soon = msUntil > -3 * 3_600_000 && msUntil < 24 * 3_600_000;
  return {
    month: part(start, { month: "short" }).toUpperCase(),
    day: part(start, { day: "2-digit" }),
    weekday: part(start, { weekday: "short" }),
    time: part(start, { hour: "numeric", minute: "2-digit" }),
    soon,
  };
}

/**
 * The one-line date eyebrow above an event title. When the event is within
 * the day it reads "Today · 6:00 PM"; otherwise "Mon · Jul 7 · 6:00 PM".
 * (The big stub already carries month/day, so the non-soon eyebrow can stay
 * terse — but it re-states the date because the eyebrow is what a
 * screen-reader user hears first.)
 */
export function stubEyebrow(s: StubDate): string {
  if (s.soon) return `Today · ${s.time}`;
  const month = s.month.charAt(0) + s.month.slice(1).toLowerCase();
  const day = String(Number(s.day));
  return `${s.weekday} · ${month} ${day} · ${s.time}`;
}
