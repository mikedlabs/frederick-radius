import type { DayOfWeek, Hours, HoursWindow } from "@/data/places";

/**
 * Parse Google Places `weekdayDescriptions` (stored in our enrichment as
 * `weekday_hours`) into the structured `Hours` shape `getOpenStatus`
 * needs.
 *
 * This is the missing link in the hours pipeline. Enrichment carries the
 * human-readable strings ("Monday: 9:00 AM - 5:00 PM") for ~2,600 places,
 * but nothing ever turned them into `{ mon: [{ open, close }] }` — so
 * open-now coverage sat at ~3.6% (only the handful of hand-curated
 * schedules) and ~80% of the catalog rendered "Hours not posted" while
 * the verified hours sat right there in the data.
 *
 * Real formats handled (surveyed from the live data):
 *   "9:00 AM - 5:00 PM"            single window
 *   "11:00 AM - 3:00 PM, 5:00 - 9:00 PM"   comma-split windows
 *   "Open 24 hours"               whole day  -> 00:00-24:00
 *   "Closed"                      no window  (day omitted)
 *   "1:00 - 4:00 PM"              open meridiem omitted -> inherits close's
 *   "11:00 AM - 1:00 AM"          past-midnight close (getOpenStatus wraps)
 *
 * Output is 24h "HH:MM". A midnight close is emitted as "00:00";
 * getOpenStatus already treats close<=open as next-day, so overnight
 * windows resolve correctly. "Open 24 hours" emits close "24:00" so the
 * full day is covered.
 *
 * Defensive by design: every real provider array must contain exactly one
 * recognized line for each weekday. Any malformed/unknown line, duplicate, or
 * missing day rejects the whole schedule. Callers interpret a missing
 * structured day as closed, so keeping a parseable subset would turn a
 * provider-format change into a confident false closure.
 */

const DAY_KEY: Record<string, DayOfWeek> = {
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
  sunday: "sun",
};

const DASH = /\s*[–—-]\s*/; // en / em / hyphen, any surrounding space

/** "9:00 AM" | "1:00" (+ inherited meridiem) -> "HH:MM" (24h), or null. */
function to24(raw: string, inherit?: "AM" | "PM"): string | null {
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ?? "00";
  const ap = (m[3] || inherit || "").toUpperCase();
  if (ap !== "AM" && ap !== "PM") return null; // can't resolve 12h -> 24h
  if (h < 1 || h > 12 || parseInt(min, 10) > 59) return null;
  if (ap === "AM") {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }
  return `${String(h).padStart(2, "0")}:${min}`;
}

/** Meridiem of a fully-qualified time, so a bare open time can inherit it
 *  ("1:00 - 4:00 PM" -> the 1:00 is PM). */
function meridiemOf(raw: string): "AM" | "PM" | undefined {
  const m = raw.trim().match(/(AM|PM)\s*$/i);
  return m ? (m[1].toUpperCase() as "AM" | "PM") : undefined;
}

function parseWindows(rest: string): HoursWindow[] | null {
  if (/^closed$/i.test(rest)) return [];
  if (/^(?:open\s+)?24\s*hours$/i.test(rest)) {
    return [{ open: "00:00", close: "24:00" }];
  }
  const windows: HoursWindow[] = [];
  for (const part of rest.split(/,\s*/)) {
    const pieces = part.split(DASH);
    if (pieces.length !== 2) return null;
    const [a, b] = pieces;
    if (!a || !b) return null;
    const close = to24(b);
    const open = to24(a, meridiemOf(b)); // bare open inherits the close's meridiem
    if (!open || !close) return null;
    windows.push({ open, close });
  }
  return windows.length > 0 ? windows : null;
}

export function parseGoogleHours(
  weekdayDescriptions: string[] | undefined | null,
): Hours | undefined {
  if (!weekdayDescriptions?.length) return undefined;
  const hours: Hours = {};
  const seenDays = new Set<DayOfWeek>();
  for (const line of weekdayDescriptions) {
    if (typeof line !== "string") return undefined;
    const i = line.indexOf(":"); // first colon separates the day from the rest
    if (i < 0) return undefined;
    const day = DAY_KEY[line.slice(0, i).trim().toLowerCase()];
    if (!day) return undefined;
    // Duplicate provider days are ambiguous. Reject the entire schedule
    // instead of selecting whichever line happened to arrive last.
    if (seenDays.has(day)) return undefined;
    seenDays.add(day);
    // `\s` matches Google's narrow / non-breaking spaces too, so this one
    // collapse normalizes "9:00 AM" down to "9:00 AM".
    const rest = line.slice(i + 1).replace(/\s+/g, " ").trim();
    const windows = parseWindows(rest);
    // A partially parsed week is worse than no schedule: callers interpret a
    // missing day as closed. If Google changes one line's format, fail the
    // whole row closed rather than publish a confident false closure.
    if (windows === null) return undefined;
    if (windows.length) hours[day] = windows;
  }
  if (seenDays.size !== 7) return undefined;
  return Object.keys(hours).length ? hours : undefined;
}
