import { easternWallToUtcISO } from "@/lib/tz";
import { isHoursFresh } from "@/lib/hours-freshness";
import type { DayOfWeek, Hours, HoursWindow } from "@/data/places";

const DAYS: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DAY_LABEL: Record<DayOfWeek, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

// One formatter for the module's lifetime. Constructing Intl.DateTimeFormat
// is the expensive part (ICU locale + zone lookup), and getOpenStatus runs
// once per place in hot loops — the map's time scrubber calls it for every
// scoped place on every tick, which measured 24-68ms per tick (hardware
// dependent) with ~99% of it this redundant construction. Cached, the same
// tick is ~1ms. Formatters are stateless after creation, so reuse is safe.
const FREDERICK_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
});

// A same-instant memo on top: the scrubber loop asks about the SAME instant
// for every place in the pass, so day/minutes resolve once per distinct time.
let lastClockMs = Number.NaN;
let lastClockValue: { day: DayOfWeek; minutes: number; date: string } | null = null;

function nowInFrederick(d: Date = new Date()): { day: DayOfWeek; minutes: number; date: string } {
  if (d.getTime() === lastClockMs && lastClockValue) return lastClockValue;
  const parts = Object.fromEntries(FREDERICK_CLOCK.formatToParts(d).map((p) => [p.type, p.value]));
  const dayMap: Record<string, DayOfWeek> = {
    Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat",
  };
  const day = dayMap[parts.weekday] ?? "mon";
  const hh = parseInt(parts.hour ?? "0", 10);
  const mm = parseInt(parts.minute ?? "0", 10);
  lastClockMs = d.getTime();
  lastClockValue = { day, minutes: (hh % 24) * 60 + mm, date: `${parts.year}-${parts.month}-${parts.day}` };
  return lastClockValue;
}

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export type OpenStatus =
  | { state: "open"; closesAt: string; closingSoon: boolean; allDay?: boolean }
  | { state: "closing-soon"; closesAt: string }
  | { state: "closed"; opensAt?: string; opensDay?: DayOfWeek; opensToday?: boolean }
  | { state: "unverified" }
  | { state: "unknown" };

/**
 * An all-day / "open 24 hours" window: midnight to midnight, however the source
 * encodes it (00:00–24:00, or 00:00–00:00). Detected explicitly so it renders
 * as "Open 24 hours" instead of the nonsense "12am–12pm" that a naive
 * open–close format produced (the Dog Park bug). A normal window that merely
 * closes at midnight (e.g. 17:00–00:00) is NOT all-day and is left alone.
 */
export function isAllDayWindow(w: HoursWindow): boolean {
  return w.open === "00:00" && (w.close === "24:00" || w.close === "00:00");
}

/** One day's windows as a display string: "Open 24 hours", a joined list of
 *  "9am–5pm" ranges, or "Closed" when there are none. */
export function formatWindows(windows: HoursWindow[]): string {
  if (windows.length === 0) return "Closed";
  if (windows.some(isAllDayWindow)) return "Open 24 hours";
  return windows.map((w) => `${formatTime(w.open)}–${formatTime(w.close)}`).join(", ");
}

/**
 * "Open right now" — the shared predicate behind every open-now count
 * and filter (the map readout, the radius instrument, the browse filter).
 * Centralized so the definition can never drift between surfaces: only
 * verified-open states count. "unverified" and "unknown" never do, so a
 * count built on this is always "at least N confirmed open" and never
 * over-asserts.
 */
/** A time-scrubbed map may dim only a confirmed closed place. */
export function shouldDimForHours(status: OpenStatus): boolean {
  return status.state === "closed";
}

export function isOpenNow(status: OpenStatus): boolean {
  return status.state === "open" || status.state === "closing-soon";
}

/**
 * "Definitively closed right now" — true ONLY when the venue has verified
 * hours that place `now` outside every window. Unknown or unverified hours
 * return false: we never claim a venue is closed on evidence we don't have.
 *
 * The guard behind cross-table honesty (audit DQ-019 / FR-001): a happy hour
 * or deal must not read "on now" when its venue is provably closed and would
 * send someone to a locked door. Callers keep the promotion live when the
 * venue state is merely unknown, so a real pour at a hours-less venue still
 * shows.
 */
export function isClosedNow(
  hours: Hours | undefined,
  verified: boolean,
  now: Date = new Date(),
): boolean {
  return getOpenStatus(hours, { verified }, now).state === "closed";
}

/** Calendar arithmetic, independent of the browser zone and 23/25-hour days. */
function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
function dayForDate(date: string): DayOfWeek {
  return DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

/** First-party evidence always expires, including during an emergency provider rollback. */
export function isScheduleEvidenceCurrent(hours: Hours, at: Date): boolean {
  const evidence = hours._official;
  if (!evidence) return true;
  const date = nowInFrederick(at).date;
  return isHoursFresh(evidence.observed_at, at) &&
    at.getTime() <= Date.parse(evidence.expires_at) &&
    date >= evidence.coverage_from && date <= evidence.coverage_through;
}

type MinuteWindow = { open: number; close: number; allDay: boolean };
function dateCutoff(hours: Hours, date: string): number {
  const exception = hours._official?.exceptions.find((item) => item.date === date);
  return exception?.closed ? 0 : exception?.closes_at ? parseHHMM(exception.closes_at) : 1440;
}
function startingWindows(hours: Hours, date: string): MinuteWindow[] {
  const cutoff = dateCutoff(hours, date);
  if (!cutoff) return [];
  return (hours[dayForDate(date)] ?? []).flatMap((window) => {
    const open = parseHHMM(window.open);
    let close = parseHHMM(window.close);
    if (close <= open) close += 1440;
    // Today's early closure stops even an overnight window. Tomorrow's full
    // closure takes precedence at midnight, rather than inheriting a spill.
    close = Math.min(close, cutoff < 1440 ? cutoff : 1440 + dateCutoff(hours, shiftDate(date, 1)));
    return close > open ? [{ open, close, allDay: isAllDayWindow(window) && close - open === 1440 }] : [];
  });
}
function windowsForDate(hours: Hours, date: string): MinuteWindow[] {
  const cutoff = dateCutoff(hours, date);
  if (!cutoff) return [];
  const spill = startingWindows(hours, shiftDate(date, -1))
    .filter((window) => window.close > 1440)
    .map((window) => ({ open: 0, close: Math.min(window.close - 1440, cutoff), allDay: false }));
  return [...spill, ...startingWindows(hours, date)].sort((a, b) => a.open - b.open);
}
function hhmm(minutes: number): string {
  if (minutes === 1440) return "24:00";
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Today's actual windows, separate from the unchanged ordinary weekly table. */
export function hoursForDate(hours: Hours, at: Date = new Date()): HoursWindow[] | undefined {
  if (!isScheduleEvidenceCurrent(hours, at)) return undefined;
  return windowsForDate(hours, nowInFrederick(at).date).map((window) => ({ open: hhmm(window.open), close: hhmm(window.close) }));
}

export function getOpenStatus(
  hours: Hours | undefined,
  options: { verified?: boolean } = {},
  now: Date = new Date(),
): OpenStatus {
  if (!hours) return { state: "unknown" };
  if (!hours._official) return getWeeklyOpenStatus(hours, options, now);
  if (!options.verified) return { state: "unverified" };
  if (!Number.isFinite(now.getTime()) || !isScheduleEvidenceCurrent(hours, now)) return { state: "unknown" };
  const { date, minutes } = nowInFrederick(now);
  for (const window of windowsForDate(hours, date)) {
    if (minutes < window.open || minutes >= window.close) continue;
    const closesAt = hhmm(window.close);
    if (window.allDay) return { state: "open", closesAt, closingSoon: false, allDay: true };
    if (window.close - minutes <= 60) return { state: "closing-soon", closesAt };
    return { state: "open", closesAt, closingSoon: false };
  }
  for (let i = 0; i < 7; i++) {
    const candidateDate = shiftDate(date, i);
    for (const window of startingWindows(hours, candidateDate)) {
      if (i === 0 && window.open <= minutes) continue;
      const [year, month, day] = candidateDate.split("-").map(Number);
      const candidate = new Date(easternWallToUtcISO(year, month, day, Math.floor(window.open / 60), window.open % 60));
      // Do not promise a next opening beyond the evidence's visit horizon.
      if (!isScheduleEvidenceCurrent(hours, candidate)) continue;
      return { state: "closed", opensAt: hhmm(window.open), opensDay: dayForDate(candidateDate), ...(i === 0 ? { opensToday: true } : {}) };
    }
  }
  return { state: "closed" };
}

// Preserve the small weekly-only hot path for provider schedules.
function getWeeklyOpenStatus(
  hours: Hours | undefined,
  options: { verified?: boolean } = {},
  now: Date = new Date(),
): OpenStatus {
  if (!hours) return { state: "unknown" };
  if (!options.verified) return { state: "unverified" };
  const { day, minutes } = nowInFrederick(now);

  const todayWindows = hours[day] ?? [];
  for (const w of todayWindows) {
    const open = parseHHMM(w.open);
    let close = parseHHMM(w.close);
    if (close <= open) close += 24 * 60;
    if (minutes >= open && minutes < close) {
      // An open-24-hours window never "closes soon" and reads as all-day.
      if (isAllDayWindow(w)) return { state: "open", closesAt: w.close, closingSoon: false, allDay: true };
      const left = close - minutes;
      const closingSoon = left <= 60;
      if (closingSoon) return { state: "closing-soon", closesAt: w.close };
      return { state: "open", closesAt: w.close, closingSoon: false };
    }
  }

  // Overnight spillover: a window that opened YESTERDAY and closes after
  // midnight (close <= open, e.g. "11:00 AM – 1:00 AM") is still open in
  // the early hours of today. The today-window loop above only catches
  // the late-evening side of that range on the day it opens; without this
  // a bar open "Fri 5 PM – 2 AM" reads as CLOSED at 1 AM Saturday. Check
  // yesterday's overnight windows and honor the [00:00, close) tail.
  const prevDay = DAYS[(DAYS.indexOf(day) + 6) % 7];
  for (const w of hours[prevDay] ?? []) {
    const open = parseHHMM(w.open);
    const close = parseHHMM(w.close);
    if (close <= open && minutes < close) {
      const left = close - minutes;
      if (left <= 60) return { state: "closing-soon", closesAt: w.close };
      return { state: "open", closesAt: w.close, closingSoon: false };
    }
  }

  for (let i = 0; i < 7; i++) {
    const idx = (DAYS.indexOf(day) + i) % 7;
    const d = DAYS[idx];
    const windows = hours[d];
    if (!windows || windows.length === 0) continue;
    if (i === 0) {
      const upcoming = windows.find((w) => parseHHMM(w.open) > minutes);
      if (upcoming) return { state: "closed", opensAt: upcoming.open, opensDay: d, opensToday: true };
    } else {
      return { state: "closed", opensAt: windows[0].open, opensDay: d };
    }
  }
  return { state: "closed" };
}


export function formatTime(hhmm: string): string {
  const [hStr, m] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  // "24:00" is midnight (end-of-day) — normalize to the 0-23 clock BEFORE the
  // am/pm split, so it reads "12am", not the old "12pm" (the Dog Park bug).
  if (h >= 24) h -= 24;
  const am = h < 12;
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  const min = m === "00" ? "" : `:${m}`;
  return `${h}${min}${am ? "am" : "pm"}`;
}

export function formatHoursLine(status: OpenStatus): string {
  if (status.state === "open") return status.allDay ? "Open 24 hours" : `Open until ${formatTime(status.closesAt)}`;
  if (status.state === "closing-soon") return `Closing soon · ${formatTime(status.closesAt)}`;
  if (status.state === "closed" && status.opensAt && status.opensDay) {
    // Same-day reopen drops the day token: "Closed · Opens Tue 11am" read
    // like a next-week wait when the doors open later TODAY.
    return status.opensToday
      ? `Closed · Opens ${formatTime(status.opensAt)}`
      : `Closed · Opens ${DAY_LABEL[status.opensDay]} ${formatTime(status.opensAt)}`;
  }
  if (status.state === "closed") return "Closed";
  if (status.state === "unverified") return "Hours not confirmed";
  return "Hours not posted";
}

export function formatFullHours(hours: Hours | undefined): { day: DayOfWeek; label: string; windows: HoursWindow[] }[] {
  const order: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return order.map((d) => ({
    day: d,
    label: DAY_LABEL[d],
    windows: hours?.[d] ?? [],
  }));
}
