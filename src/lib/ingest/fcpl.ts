/**
 * FCPL — Frederick County Public Libraries event mapper.
 *
 * The library's `lc_calendar` JSON feed (frederick.librarycalendar.com/events/
 * feed/json) is the #1 county-wide content target: ~1,700 programs across 8
 * branches, filling every gap town (Brunswick, Myersville, Emmitsburg, …) that
 * has no other machine-readable calendar. It is NOT live-fetched — the feed is
 * unbounded (2.3MB, ~16s, date params ignored) and blows the 8s request budget
 * — so it rides the DAILY CRON-INGEST path (/api/ingest/fcpl) into
 * `ingested_events`, surfacing as the recurring-collapsed civic calendar on
 * /events (story times become one "· 11 more dates" series, not 12 rows).
 *
 * This module is the PURE mapping layer (no fetch, no DB) so it can be unit
 * tested against real records.
 */
import type { ParsedEvent } from "./parser";

const SOURCE_DOMAIN = "frederick.librarycalendar.com";

/** One raw record from the lc_calendar JSON feed (only the fields we use).
 *  Free-text fields are typed `unknown`: in the wild the feed sometimes serves
 *  an object/array/null where a string is expected, so every read goes through
 *  asText()/fcplFieldString(). */
export type FcplRaw = {
  title?: unknown;
  id?: string | number;
  uuid?: string;
  public?: boolean;
  published?: boolean;
  url?: unknown;
  changed?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  timezone?: unknown;
  branch?: unknown;
  room?: unknown;
  offsite_address?: unknown;
  program_type?: unknown;
  age_group?: unknown;
  description?: unknown;
  program_description?: unknown;
};

/** Branch display name (substring) -> the municipality slug it sits in. The
 *  multi-branch / "Around the Community" / Bookmobile rows are system-wide and
 *  fall through to the county seat. */
const BRANCH_MUNICIPALITY: Array<[RegExp, string]> = [
  [/c\.?\s*burr\s*artz/i, "frederick"],
  [/brunswick/i, "brunswick"],
  [/thurmont/i, "thurmont"],
  [/urbana/i, "urbana"],
  [/myersville/i, "myersville"],
  [/emmitsburg/i, "emmitsburg"],
  [/walkersville/i, "walkersville"],
  [/middletown/i, "middletown"],
  [/point\s*of\s*rocks|edward\s*f\.?\s*fry/i, "brunswick"], // Point of Rocks sits by Brunswick
];

/** A feed value can be a plain string or a `{ "87": "Around the Community" }`
 *  object; normalize either to a readable, "/"-joined string. */
export function fcplFieldString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).map(String).join(" / ").trim();
  return String(v);
}

/** Map a branch label to its municipality slug. Unknown / multi-branch -> the
 *  county seat (frederick), the honest county-wide fallback. */
export function fcplMunicipality(branchLabel: string): string {
  const matches = BRANCH_MUNICIPALITY.filter(([re]) => re.test(branchLabel)).map(([, m]) => m);
  // Exactly one branch matched -> that town; zero or many (system-wide) -> seat.
  return matches.length === 1 ? matches[0] : "frederick";
}

/** Infer an honest category from the program type + audience. Library programs
 *  are mostly community learning; storytimes/kids -> family, wellness its own. */
export function fcplCategory(programType: string, ageGroup: string): string {
  const p = programType.toLowerCase();
  const a = ageGroup.toLowerCase();
  if (/storytime|tween|early start/.test(p) || /birth|elementary/.test(a)) return "family";
  if (/wellness/.test(p)) return "wellness";
  return "community";
}

/** Offset of an IANA timezone from UTC, in ms, at a given instant. */
function tzOffsetMs(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = dtf.formatToParts(date).reduce<Record<string, string>>((a, x) => {
    a[x.type] = x.value;
    return a;
  }, {});
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asIfUtc - date.getTime();
}

/** A free-text feed field is sometimes a non-string (object/array/null in the
 *  wild lc_calendar data); take it only when it is genuinely a string. */
function asText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Convert a local "YYYY-MM-DD HH:MM:SS" wall time in `tzid` to a UTC ISO
 *  string. "2026-06-20 09:00:00" ET -> "2026-06-20T13:00:00.000Z" (EDT). */
export function localToUtcIso(local: unknown, tzid = "America/New_York"): string | null {
  const m = asText(local).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S] = m;
  const asUtc = Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +(S ?? "0"));
  if (Number.isNaN(asUtc)) return null;
  const off = tzOffsetMs(tzid, new Date(asUtc));
  return new Date(asUtc - off).toISOString();
}

export type FcplMapped = { event: ParsedEvent; municipality: string; category: string };

/** Map one raw feed record to a ParsedEvent + its municipality/category, or
 *  null if it's not a usable public, future-dated, time-stamped program. */
export function fcplMapOne(raw: FcplRaw, now: Date): FcplMapped | null {
  if (raw.public === false || raw.published === false) return null;
  const title = asText(raw.title).trim();
  const uid = String(raw.id ?? raw.uuid ?? "").trim();
  if (!title || !uid) return null;

  const tzid = asText(raw.timezone) || "America/New_York";
  const startsAtUtc = localToUtcIso(raw.start_date, tzid);
  if (!startsAtUtc) return null;
  if (Date.parse(startsAtUtc) < now.getTime()) return null; // past -> skip

  const endsAtUtc = localToUtcIso(raw.end_date, tzid) ?? undefined;
  const allDay = /\b00:00:00$/.test(asText(raw.start_date));

  const branchLabel = fcplFieldString(raw.branch) || fcplFieldString(raw.offsite_address) || "Frederick County Public Libraries";
  const room = fcplFieldString(raw.room);
  const municipality = fcplMunicipality(branchLabel);
  const category = fcplCategory(fcplFieldString(raw.program_type), fcplFieldString(raw.age_group));

  // Use changed timestamp as the change-detection key (DTSTAMP analogue);
  // fall back to start so re-runs still upsert idempotently.
  const dtstamp = localToUtcIso(raw.changed, tzid) ?? startsAtUtc;

  const event: ParsedEvent = {
    uid,
    summary: title,
    description: (asText(raw.description) || asText(raw.program_description)).trim() || undefined,
    sourceUrl: asText(raw.url).trim() || undefined,
    rawLocation: [branchLabel, room].filter(Boolean).join(", ") || undefined,
    startsAtUtc,
    endsAtUtc,
    tzid,
    allDay,
    dtstamp,
    rawVevent: JSON.stringify(raw),
  };
  return { event, municipality, category };
}

/** Map the whole feed, dropping non-public / past / unparseable rows. */
export function fcplMapFeed(feed: unknown, now: Date): FcplMapped[] {
  if (!Array.isArray(feed)) return [];
  const out: FcplMapped[] = [];
  for (const raw of feed) {
    const mapped = fcplMapOne(raw as FcplRaw, now);
    if (mapped) out.push(mapped);
  }
  return out;
}

export const FCPL_SOURCE_DOMAIN = SOURCE_DOMAIN;
