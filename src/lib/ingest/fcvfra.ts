/**
 * FCVFRA — Frederick County Volunteer Fire & Rescue Association event mapper.
 *
 * fcvfra.com/apps/public/events/ is the one page that aggregates EVERY volunteer
 * fire company's public happenings county-wide: weekly/monthly bingo, fish fries,
 * carnivals, crab feasts, breakfasts, raffles. It is the richest HIDDEN-GEM +
 * GAP-TOWN source (Rocky Ridge, New Midway, Walkersville, Brunswick, Thurmont,
 * Carroll Manor) — towns with no other machine-readable calendar. No feed: it's
 * a ColdFusion page, scraped on the daily cron (the FCPL pattern).
 *
 * The listing carries each row inline: Event_ID, a name that encodes the
 * recurrence ("Vigilant Hose Co WEDNESDAY BINGO"), and a season date RANGE
 * (MM/DD/YYYY - MM/DD/YYYY). We:
 *   - SKIP the free-text "2026 CALENDAR OF EVENTS" rollups (parsing their loose
 *     "January 10-Bingo" text would fabricate dates — a wrong event is worse
 *     than none).
 *   - For a recurring series (weekday / BINGO / WEEKLY / MONTHLY in the name over
 *     a long range): emit the NEXT upcoming occurrence on the start date's
 *     weekday, within the season. Re-run daily, the next occurrence advances.
 *   - For a short-range single event (a carnival over a weekend): emit its start.
 *
 * Pure mapping layer (no fetch, no DB) so it unit-tests against real listing HTML.
 */
import type { ParsedEvent } from "./parser";
import { localToUtcIso } from "./fcpl";

export const FCVFRA_SOURCE_DOMAIN = "fcvfra.com";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Town / ZIP -> municipality slug. Fire companies sit in the small towns, so
 *  this is the gap-town map; unknown -> the county seat. */
const TOWN_MUNI: Array<[RegExp, string]> = [
  [/rocky ridge|new midway|\b2177[78]\b/i, "thurmont"], // Rocky Ridge/New Midway are Thurmont-area (no own town page)
  [/thurmont|\b21788\b/i, "thurmont"],
  [/walkersville|\b21793\b/i, "walkersville"],
  [/brunswick|\b21716\b/i, "brunswick"],
  [/emmitsburg|\b21727\b/i, "emmitsburg"],
  [/middletown|\b21769\b/i, "middletown"],
  [/myersville|\b21773\b/i, "myersville"],
  [/new market|\b21774\b/i, "new-market"],
  [/mount airy|mt\.? airy|\b21771\b/i, "mount-airy"],
  [/woodsboro|\b21798\b/i, "woodsboro"],
  [/burkittsville|\b21718\b/i, "burkittsville"],
  [/point of rocks|adamstown|\b2177[80]\b/i, "frederick"], // Carroll Manor (Adamstown/Point of Rocks) -> seat
  [/urbana|\b21704\b/i, "urbana"],
  [/frederick|\b2170[0-5]\b/i, "frederick"],
];

export function fcvfraMunicipality(text: string): string {
  for (const [re, m] of TOWN_MUNI) if (re.test(text)) return m;
  return "frederick";
}

function parseMdy(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m; // MM/DD/YYYY
  const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd, 12, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

const ONE_DAY = 86_400_000;

/** A single parsed listing row before recurrence resolution. */
export type FcvfraRow = { id: string; name: string; rangeStart: Date; rangeEnd: Date };

/** Pull the inline rows out of the listing HTML. Each row =
 *  eventView.cfm?Event_ID=N"> ...name/venue... MM/DD/YYYY - MM/DD/YYYY ... */
export function fcvfraRows(html: string): FcvfraRow[] {
  const stripped = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  const chunks = stripped.split(/eventView\.cfm\?Event_ID=/i).slice(1);
  const rows: FcvfraRow[] = [];
  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const text = chunk
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (!dateMatch) continue;
    const rangeStart = parseMdy(dateMatch[1]);
    const rangeEnd = parseMdy(dateMatch[2]);
    if (!rangeStart || !rangeEnd) continue;
    // Name = text after the leading id, before the date range; drop a trailing
    // address tail (a comma + state/zip) so the title stays the event, not the
    // street. Falls back to the whole pre-date text.
    const name = text
      .slice(id.length, text.indexOf(dateMatch[0]))
      .replace(/^["'>\s]+/, "") // drop the leftover `">` after the Event_ID link
      .trim()
      .replace(/[\s,–-]+$/, "");
    // Keep the full text (org + event + venue + address) so municipality
    // detection can see the town/zip; cleanFcvfraTitle trims it for display.
    if (name.length >= 3) rows.push({ id, name, rangeStart, rangeEnd });
  }
  return rows;
}

/** The listing crams "{Org} {EVENT IN CAPS} {Venue} {Address} {Town}" into one
 *  string. Recover just the event name: drop the trailing street address, cut at
 *  the event's last ALL-CAPS word (the venue follows in Title Case), and unshout
 *  the caps (brand voice: no shouting). Keep a trailing "(2nd Saturday…)" note. */
export function cleanFcvfraTitle(raw: string): string {
  // Drop a trailing street address, but only when a real street suffix follows,
  // so a year ("2026 Annual Carnival") isn't mistaken for a house number.
  let t = raw
    .replace(
      // {house number} {up to 4 street-name words} {street suffix} {rest} — the
      // word cap stops a long event name from being swallowed as one "address".
      /\s+\d{1,6}\s+(?:[A-Za-z][\w.]*\s+){0,4}(?:Road|Rd|Street|St|Ave|Avenue|Pike|Lane|Ln|Drive|Dr|Way|Court|Ct|Blvd|Boulevard|Circle|Cir|Place|Pl|Grounds|Park|Highway|Hwy|Trail|Terrace|Square|Sq)\b.*$/i,
      "",
    )
    .trim();
  const caps = [...t.matchAll(/\b[A-Z][A-Z'&.]+\b/g)];
  if (caps.length) {
    const last = caps[caps.length - 1];
    let end = (last.index ?? 0) + last[0].length;
    const paren = t.slice(end).match(/^\s*\([^)]*\)/);
    if (paren) end += paren[0].length;
    t = t.slice(0, end).trim();
  }
  t = t.replace(/\b[A-Z]{2,}(?:'[A-Z]+)?\b/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
  return t.replace(/\s+/g, " ").trim();
}

export type FcvfraMapped = { event: ParsedEvent; municipality: string; category: string };

/** Resolve one row to its next upcoming occurrence + map to a ParsedEvent, or
 *  null (rollup / ongoing / fully past). */
export function fcvfraMapRow(row: FcvfraRow, now: Date): FcvfraMapped | null {
  const lower = row.name.toLowerCase();
  // Free-text year rollups carry no single date — skip rather than fabricate.
  if (/calend[ae]r of events/i.test(lower)) return null;

  const spanDays = Math.round((row.rangeEnd.getTime() - row.rangeStart.getTime()) / ONE_DAY);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0);
  const hasWeekday = WEEKDAYS.some((d) => lower.includes(d));
  const recurring = (hasWeekday || /\bbingo\b|\bweekly\b|\bfish fry\b|\bbreakfast\b/.test(lower)) && spanDays > 16;
  const monthly = /\bmonthly\b/.test(lower);

  let occ: number | null = null;
  if (recurring) {
    // Anchor to the weekday NAMED in the title ("...WEDNESDAY BINGO"), NOT the
    // season-range start date — the range start is arbitrary and need not fall
    // on the event's weekday, which produced occurrences on the wrong day (the
    // "weekday label disagrees with the date" bug). Find the first named-weekday
    // on/after rangeStart, then step by the cadence to the next occurrence at or
    // after today, within the season. Monthly series keep the date anchor.
    const stride = (monthly ? 28 : 7) * ONE_DAY;
    const namedIdx = WEEKDAYS.findIndex((d) => lower.includes(d));
    let anchor = row.rangeStart.getTime();
    if (namedIdx >= 0 && !monthly) {
      const startWd = new Date(anchor).getUTCDay();
      anchor += (((namedIdx - startWd) % 7) + 7) % 7 * ONE_DAY;
    }
    let t = anchor;
    while (t < todayUtc) t += stride;
    occ = t <= row.rangeEnd.getTime() ? t : null;
  } else if (spanDays >= 0 && spanDays <= 16) {
    // Single / multi-day event (carnival, feast): use the start if it's not past.
    occ = row.rangeEnd.getTime() >= todayUtc ? Math.max(row.rangeStart.getTime(), todayUtc) : null;
  }
  // else: long span with no recurrence (e.g. an "online raffle store") -> skip.
  if (occ == null) return null;

  const occDate = new Date(occ);
  const ymd = `${occDate.getUTCFullYear()}-${String(occDate.getUTCMonth() + 1).padStart(2, "0")}-${String(occDate.getUTCDate()).padStart(2, "0")}`;
  const startsAtUtc = localToUtcIso(`${ymd} 12:00:00`);
  if (!startsAtUtc) return null;

  const event: ParsedEvent = {
    uid: row.id,
    summary: cleanFcvfraTitle(row.name),
    sourceUrl: `https://www.fcvfra.com/apps/public/events/eventView.cfm?Event_ID=${row.id}`,
    rawLocation: undefined,
    startsAtUtc,
    endsAtUtc: undefined,
    tzid: "America/New_York",
    allDay: true,
    dtstamp: startsAtUtc, // next-occurrence date doubles as the change key
    rawVevent: JSON.stringify({ id: row.id, name: row.name, range: [row.rangeStart, row.rangeEnd] }),
  };
  return { event, municipality: fcvfraMunicipality(row.name), category: "community" };
}

/** Map the whole listing HTML to upcoming fire-company events. */
export function fcvfraMapListing(html: string, now: Date): FcvfraMapped[] {
  const out: FcvfraMapped[] = [];
  for (const row of fcvfraRows(html)) {
    const mapped = fcvfraMapRow(row, now);
    if (mapped) out.push(mapped);
  }
  return out;
}
