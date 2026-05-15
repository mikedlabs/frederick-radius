/**
 * iCal parsing via ical.js (battle-tested — handles line folding, escaped
 * commas, VALUE=DATE all-day, TZID). We never hand-roll VEVENT parsing.
 *
 * Output is normalized to UTC instants + a kept TZID, per the spec's
 * non-negotiable: convert at ingest, store UTC, render local in the app.
 */
import ICAL from "ical.js";

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

/** All-day events: DTSTART;VALUE=DATE → midnight America/New_York that day. */
function allDayStartUtc(t: ICAL.Time): string {
  // t is a date-only value; build NY-midnight then convert to UTC.
  const y = t.year;
  const m = String(t.month).padStart(2, "0");
  const d = String(t.day).padStart(2, "0");
  // America/New_York is UTC-5 (EST) or UTC-4 (EDT). Use Intl to resolve the
  // correct offset for that calendar date instead of hardcoding.
  const naive = new Date(`${y}-${m}-${d}T00:00:00`);
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  })
    .formatToParts(naive)
    .find((p) => p.type === "timeZoneName")?.value;
  // tzName like "GMT-4" / "GMT-5"
  const off = tzName?.match(/GMT([+-]\d+)/)?.[1] ?? "-5";
  const sign = off.startsWith("-") ? "-" : "+";
  const hh = String(Math.abs(parseInt(off, 10))).padStart(2, "0");
  return new Date(`${y}-${m}-${d}T00:00:00${sign}${hh}:00`).toISOString();
}

export function parseICal(icsText: string): ParsedEvent[] {
  let comp: ICAL.Component;
  try {
    comp = new ICAL.Component(ICAL.parse(icsText));
  } catch {
    return [];
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
      const sourceUrl = description.match(URL_RE)?.[1];

      const startsAtUtc = allDay ? allDayStartUtc(dtstart) : toUtcIso(dtstart);
      if (!startsAtUtc) continue;

      out.push({
        uid: String(uid),
        summary: String(summary).trim(),
        description: description || undefined,
        sourceUrl,
        rawLocation,
        startsAtUtc,
        endsAtUtc: allDay ? undefined : toUtcIso(dtend),
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
  return out;
}
