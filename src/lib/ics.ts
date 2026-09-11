/**
 * Single source of truth for iCalendar (.ics) generation. Used by both
 * the static per-seed-event route and the client-side "Add to calendar"
 * on every event card (live/aggregated events have no static route, so
 * the explorer needs a pure builder it can run in the browser).
 *
 * RFC 5545: CRLF line endings, UTC timestamps with a trailing Z for
 * timed events, and VALUE=DATE with a non-inclusive DTEND for all-day
 * events (a one-day fest is DTSTART today, DTEND tomorrow).
 */

export type IcsInput = {
  /** Stable id; becomes the UID. */
  uid: string;
  title: string;
  /** ISO 8601. */
  starts_at: string;
  /** ISO 8601. */
  ends_at: string;
  description?: string;
  venue_name?: string;
  address?: string;
  /** Absolute canonical URL for the event. */
  url?: string;
  /** All-day events use a date-only DTSTART/DTEND in America/New_York. */
  all_day?: boolean;
};

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** UTC stamp form: 20260514T180000Z. */
function utcStamp(iso: string): string {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/** Calendar date in America/New_York as a [y, m, d] tuple. */
function nyParts(iso: string): [number, number, number] {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
  return [get("year"), get("month"), get("day")];
}

/** YYYYMMDD for a date-only value. */
function dateValue(y: number, m: number, d: number): string {
  return `${y}${pad(m)}${pad(d)}`;
}

/** The day after [y,m,d], computed in UTC integer space (TZ-safe). */
function nextDay(y: number, m: number, d: number): [number, number, number] {
  const t = new Date(Date.UTC(y, m - 1, d) + 86_400_000);
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

/** RFC 5545 TEXT escaping for SUMMARY/DESCRIPTION/LOCATION. */
function escapeText(s: string): string {
  return s.replace(/[\\,;]/g, "\\$&").replace(/\r?\n/g, "\\n");
}

/** The VEVENT block for one event — shared by the single-event download
 *  and the multi-event subscription feeds. */
function veventLines(input: IcsInput): string[] {
  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${input.uid}@frederickradius.app`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`,
  ];

  if (input.all_day) {
    const [sy, sm, sd] = nyParts(input.starts_at);
    // DTEND is non-inclusive: the calendar date after the last day.
    const [ey0, em0, ed0] = nyParts(input.ends_at);
    const endIsLater =
      ey0 * 10000 + em0 * 100 + ed0 > sy * 10000 + sm * 100 + sd;
    const [ey, em, ed] = endIsLater ? nextDay(ey0, em0, ed0) : nextDay(sy, sm, sd);
    lines.push(
      `DTSTART;VALUE=DATE:${dateValue(sy, sm, sd)}`,
      `DTEND;VALUE=DATE:${dateValue(ey, em, ed)}`,
    );
  } else {
    lines.push(
      `DTSTART:${utcStamp(input.starts_at)}`,
      `DTEND:${utcStamp(input.ends_at)}`,
    );
  }

  lines.push(`SUMMARY:${escapeText(input.title)}`);

  const descParts: string[] = [];
  if (input.description?.trim()) descParts.push(input.description.trim());
  if (input.url) descParts.push(input.url);
  if (descParts.length) {
    lines.push(`DESCRIPTION:${descParts.map(escapeText).join("\\n\\n")}`);
  }

  const loc = [input.venue_name, input.address].filter(Boolean).join(", ");
  if (loc) lines.push(`LOCATION:${escapeText(loc)}`);
  if (input.url) lines.push(`URL:${input.url}`);

  lines.push("END:VEVENT");
  return lines;
}

export function buildIcs(input: IcsInput): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Frederick Radius//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...veventLines(input),
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * A SUBSCRIBABLE calendar: many VEVENTs under one X-WR-CALNAME, with the
 * refresh hints Apple/Google/Outlook honor (REFRESH-INTERVAL is RFC 7986;
 * X-PUBLISHED-TTL is the de-facto legacy spelling). Subscribed via a
 * webcal:// link, the calendar app re-fetches on its own — the county's
 * events keep themselves current on the user's own calendar.
 */
export function buildIcsFeed(name: string, inputs: IcsInput[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Frederick Radius//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:America/New_York",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...inputs.flatMap(veventLines),
    "END:VCALENDAR",
  ].join("\r\n");
}
