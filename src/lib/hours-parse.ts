/**
 * Parser for Google Places' weekday_hours text format → structured Hours.
 *
 * Google returns lines like:
 *   "Monday: Closed"
 *   "Tuesday: 3:00 – 8:00 PM"
 *   "Friday: 11:30 AM – 10:00 PM"
 *   "Sunday: 8:00 AM – 8:00 PM"
 *
 * When only one AM/PM is present, it applies to the close time and the
 * open time inherits whichever side keeps the window non-negative — so
 * "3:00 – 8:00 PM" means 3:00 PM – 8:00 PM, not 3:00 AM – 8:00 PM.
 *
 * Whitespace contains unicode (  thin,   narrow no-break) and
 * the dash may be an en dash; we normalize both before parsing.
 *
 * Pure, no IO, unit-testable.
 */
import type { DayOfWeek, Hours, HoursWindow } from "@/data/places";

const DAY_KEY: Record<string, DayOfWeek> = {
  monday: "mon", tuesday: "tue", wednesday: "wed",
  thursday: "thu", friday: "fri", saturday: "sat", sunday: "sun",
};

/** "3:00 PM" → "15:00"; "3:00" with hint "pm" → "15:00". */
function to24(timeText: string, fallback?: "am" | "pm"): string | null {
  const m = timeText.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mins = m[2] ?? "00";
  const ap = (m[3] ?? fallback ?? "").toLowerCase();
  if (!ap) return null;
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h < 0 || h > 23) return null;
  return `${String(h).padStart(2, "0")}:${mins}`;
}

function parseLine(raw: string): { day: DayOfWeek; windows: HoursWindow[] } | null {
  // Normalize unicode spaces and dashes.
  const line = raw.replace(/[   ]/g, " ").replace(/[–—]/g, "-").trim();
  const m = line.match(/^([A-Za-z]+):\s*(.+)$/);
  if (!m) return null;
  const day = DAY_KEY[m[1].toLowerCase()];
  if (!day) return null;
  const body = m[2].trim();
  if (/^closed$/i.test(body)) return { day, windows: [] };

  // Multiple windows are comma-separated in Google's format
  // ("11:00 AM - 2:00 PM, 5:00 PM - 9:00 PM").
  const windows: HoursWindow[] = [];
  for (const seg of body.split(/\s*,\s*/)) {
    const parts = seg.split(/\s*-\s*/);
    if (parts.length !== 2) return null;
    const closeAp = (parts[1].match(/(am|pm)/i)?.[1].toLowerCase() ?? undefined) as "am" | "pm" | undefined;
    const openAp = (parts[0].match(/(am|pm)/i)?.[1].toLowerCase() ?? undefined) as "am" | "pm" | undefined;
    const close = to24(parts[1]);
    const open = to24(parts[0], openAp ?? closeAp);
    if (!open || !close) return null;
    windows.push({ open, close });
  }
  return { day, windows };
}

/**
 * Parse a Google weekday_hours array into structured Hours.
 * Returns undefined when the array is empty or every line is malformed —
 * callers should treat undefined as "no hours data" (same as before),
 * not "Closed all week".
 */
export function parseGoogleWeekdayHours(lines: string[] | undefined): Hours | undefined {
  if (!lines || lines.length === 0) return undefined;
  const out: Hours = {};
  let any = false;
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    out[parsed.day] = parsed.windows;
    any = true;
  }
  return any ? out : undefined;
}
