/**
 * Happy-hour schedule parsing — turn a human string ("Mon-Fri 3-6 PM",
 * "All day Monday; 3-6pm Tue-Fri", "every night 9 PM-close") into windows so
 * /happy-hour can say what is ON RIGHT NOW.
 *
 * HONESTY: when a schedule can't be parsed we return state 'unknown' and the
 * card simply shows the text with no "now" claim — a wrong "on now" badge
 * would be exactly the kind of lie this whole layer exists to avoid.
 *
 * Pure + tested: `now` is injected, all day/time math is America/New_York.
 */

export type HHWindow = { days: number[]; start: number; end: number };

const DAY_IDX: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
};
const DAY_KEYS = "sunday|monday|tuesday|wednesday|thursday|friday|saturday|tues|thurs|thur|weds|sun|mon|tue|wed|thu|fri|sat";
const dayNum = (t: string): number | undefined => DAY_IDX[t.toLowerCase()];

function daysFromClause(s: string): number[] {
  if (/\b(daily|every\s*day|everyday|all\s*week|nightly|every\s*night)\b/.test(s)) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  const range = s.match(new RegExp(`(${DAY_KEYS})\\s*(?:[-–]|to|thru|through)\\s*(${DAY_KEYS})`, "i"));
  if (range) {
    const a = dayNum(range[1]);
    const b = dayNum(range[2]);
    if (a === undefined || b === undefined) return [];
    const out: number[] = [];
    let d = a;
    for (let i = 0; i < 7; i++) { out.push(d); if (d === b) break; d = (d + 1) % 7; }
    return out;
  }
  const found: number[] = [];
  const re = new RegExp(`\\b(${DAY_KEYS})\\b`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const n = dayNum(m[1]);
    if (n !== undefined && !found.includes(n)) found.push(n);
  }
  return found;
}

function timeWindow(s: string): { start: number; end: number } | null {
  // An explicit range beats "all day" wording: "Sun-Fri 3-6 PM (all day
  // Thursday)" read as all-day EVERY day when the all-day test ran first
  // (the Bentztown bug) — the parenthetical exception is its own clause,
  // handled by parseHappyHour's split below.
  const m = s.match(
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:[-–]|to)\s*(?:(\d{1,2})(?::(\d{2}))?\s*(am|pm)?|(close|midnight))/i,
  );
  if (!m) {
    if (/all\s*day/.test(s)) return { start: 0, end: 1440 };
    return null;
  }
  let smer = m[3]?.toLowerCase();
  let emer = m[6]?.toLowerCase();
  const closeEnd = Boolean(m[7]);
  // Infer missing meridiems: inherit from the stated end/start; if neither is
  // stated, happy hours are afternoon/evening, so default PM.
  if (!smer && !emer) smer = emer = "pm";
  else if (!smer) smer = emer;
  else if (!emer) emer = smer;
  const to24 = (h: number, mer?: string) => {
    let hh = h % 12;
    if (mer === "pm") hh += 12;
    return hh;
  };
  const start = to24(+m[1], smer) * 60 + (m[2] ? +m[2] : 0);
  let end: number;
  if (closeEnd) end = 1440;
  else end = to24(+m[4], emer) * 60 + (m[5] ? +m[5] : 0);
  if (end <= start) end = 1440; // crosses midnight / "close" → treat as until midnight
  return { start, end };
}

/** Parse a schedule string into day+time windows. Empty when unparseable. */
export function parseHappyHour(schedule: string): HHWindow[] {
  if (!schedule) return [];
  const clauses = schedule
    .toLowerCase()
    .split(/;|(?:\s+and\s+)|(?:\.\s)/)
    // A parenthetical is its own clause: "Sun-Fri 3-6 PM (all day Thursday)"
    // must yield the 3-6 window on Sun-Fri PLUS an all-day window on
    // Thursday only — parsed as one clause, the "(all day Thursday)"
    // exception widened the whole Sun-Fri window to all-day (JoJo's/
    // Bentztown bug).
    .flatMap((c) => {
      const inner: string[] = [];
      const rest = c.replace(/\(([^)]*)\)/g, (_full, p: string) => {
        inner.push(p);
        return " ";
      });
      return [rest, ...inner];
    });
  const windows: HHWindow[] = [];
  for (const c of clauses) {
    const days = daysFromClause(c);
    const win = timeWindow(c);
    if (days.length && win) windows.push({ days, start: win.start, end: win.end });
  }
  return windows;
}

function easternNow(now: Date): { day: number; min: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: wd[get("weekday")] ?? 0, min: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

function fmtMin(m: number): string {
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const mer = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h12} ${mer}` : `${h12}:${String(mm).padStart(2, "0")} ${mer}`;
}

export type HHStatus =
  | { state: "now" }
  | { state: "today"; startsAt: string }
  | { state: "other" }
  | { state: "unknown" };

/** What is this happy hour's status relative to now (Eastern)? */
export function happyHourStatus(schedule: string, now: Date): HHStatus {
  const windows = parseHappyHour(schedule);
  if (!windows.length) return { state: "unknown" };
  const { day, min } = easternNow(now);
  for (const w of windows) {
    if (w.days.includes(day) && min >= w.start && min < w.end) return { state: "now" };
  }
  const laterToday = windows
    .filter((w) => w.days.includes(day) && min < w.start)
    .map((w) => w.start);
  if (laterToday.length) return { state: "today", startsAt: fmtMin(Math.min(...laterToday)) };
  return { state: "other" };
}
