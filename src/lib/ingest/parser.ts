/**
 * iCal parsing via ical.js (battle-tested — handles line folding, escaped
 * commas, VALUE=DATE all-day, TZID). We never hand-roll VEVENT parsing.
 *
 * Output is normalized to UTC instants + a kept TZID, per the spec's
 * non-negotiable: convert at ingest, store UTC, render local in the app.
 */
import ICAL from "ical.js";
import { easternWallToUtcISO } from "@/lib/tz";

export type ParsedEvent = {
  uid: string;
  summary: string;
  description?: string;
  /** URL pulled from DESCRIPTION (CivicEngage embeds /calendar.aspx?EID=X) */
  sourceUrl?: string;
  rawLocation?: string;
  startsAtUtc: string; // ISO UTC
  endsAtUtc?: string;
  tzid: string;
  allDay: boolean;
  dtstamp: string; // ISO UTC — change-detection key
  rawVevent: string;
};

export type ICalParseResult =
  | { valid: true; events: ParsedEvent[] }
  | { valid: false; events: []; error: string };

const URL_RE = /(https?:\/\/[^\s<>"')]+)/i;

function toUtcIso(t: ICAL.Time | null | undefined): string | undefined {
  if (!t) return undefined;
  // ICAL.Time → JS Date in UTC. For floating/all-day, ical.js anchors to
  // the component tz; we coerce all-day to America/New_York midnight below.
  try {
    return t.toJSDate().toISOString();
  } catch {
    return undefined;
  }
}

/** A calendar date at midnight America/New_York, converted to UTC. */
function allDayMidnightUtc(year: number, month: number, day: number): string {
  // Never construct a timezone-less Date here: Node interprets it in the
  // process timezone, which made DST-boundary dates vary between local
  // development and the UTC serverless runtime. The shared wall-clock helper
  // starts from Date.UTC and resolves the New York offset explicitly.
  return easternWallToUtcISO(year, month, day, 0, 0);
}

/** All-day events: DTSTART;VALUE=DATE → midnight America/New_York that day. */
function allDayStartUtc(t: ICAL.Time): string {
  return allDayMidnightUtc(t.year, t.month, t.day);
}

/** RFC 5545 all-day DTEND is exclusive. Without one, default to next midnight. */
function allDayEndUtc(start: ICAL.Time, end?: ICAL.Time): string {
  if (end) {
    return end.isDate
      ? allDayMidnightUtc(end.year, end.month, end.day)
      : (toUtcIso(end) ?? nextAllDayMidnightUtc(start));
  }
  return nextAllDayMidnightUtc(start);
}

function nextAllDayMidnightUtc(start: ICAL.Time): string {
  const next = new Date(Date.UTC(start.year, start.month - 1, start.day + 1));
  return allDayMidnightUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
}

/**
 * Parse a complete iCalendar document while preserving the distinction between
 * a valid calendar with zero usable events and an invalid upstream payload.
 *
 * `parseICal` below intentionally keeps its historical array-only API for
 * fail-soft request-time consumers. Cron ingestion uses this result API so an
 * HTML error page returned with HTTP 200 cannot become a healthy empty
 * heartbeat.
 */
export function parseICalResult(icsText: string): ICalParseResult {
  let comp: ICAL.Component;
  try {
    comp = new ICAL.Component(ICAL.parse(icsText));
  } catch {
    return { valid: false, events: [], error: "invalid iCalendar payload" };
  }
  if (comp.name.toLowerCase() !== "vcalendar") {
    return { valid: false, events: [], error: "payload is not a VCALENDAR" };
  }
  const vevents = comp.getAllSubcomponents("vevent");
  const out: ParsedEvent[] = [];

  for (const ve of vevents) {
    try {
      const uid = ve.getFirstPropertyValue("uid");
      const summary = ve.getFirstPropertyValue("summary");
      if (!uid || !summary) continue;

      const dtstartProp = ve.getFirstProperty("dtstart");
      const dtstart = dtstartProp?.getFirstValue() as ICAL.Time | undefined;
      if (!dtstart) continue;

      const allDay = Boolean(dtstart.isDate);
      const dtend = ve.getFirstProperty("dtend")?.getFirstValue() as ICAL.Time | undefined;
      const dtstampVal = ve.getFirstProperty("dtstamp")?.getFirstValue() as ICAL.Time | undefined;

      const tzid =
        dtstartProp?.getParameter("tzid")?.toString() || "America/New_York";

      const description = String(ve.getFirstPropertyValue("description") ?? "").trim();
      const rawLocation = String(ve.getFirstPropertyValue("location") ?? "").trim() || undefined;
      // Prefer the VEVENT's canonical URL property, matching the legacy
      // node-ical adapter. CivicEngage omits URL and embeds it in DESCRIPTION,
      // so retain that fallback for the shared parser.
      const eventUrl = String(ve.getFirstPropertyValue("url") ?? "").trim();
      const sourceUrl = eventUrl || description.match(URL_RE)?.[1];

      const startsAtUtc = allDay ? allDayStartUtc(dtstart) : toUtcIso(dtstart);
      if (!startsAtUtc) continue;
      const endsAtUtc = allDay
        ? allDayEndUtc(dtstart, dtend)
        : toUtcIso(dtend);

      out.push({
        uid: String(uid),
        summary: String(summary).trim(),
        description: description || undefined,
        sourceUrl,
        rawLocation,
        startsAtUtc,
        endsAtUtc,
        tzid,
        allDay,
        dtstamp: toUtcIso(dtstampVal) ?? new Date().toISOString(),
        rawVevent: ve.toString(),
      });
    } catch {
      // Skip a malformed VEVENT, never abort the whole feed.
      continue;
    }
  }
  return { valid: true, events: out };
}

export function parseICal(icsText: string): ParsedEvent[] {
  return parseICalResult(icsText).events;
}
