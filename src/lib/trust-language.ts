/**
 * Trust language: the one table of words Radius uses to say what it knows
 * and how it knows it.
 *
 * A single place page used to say "Hours not posted", "Checked at source",
 * "verified 3mo ago" and a raw "Updated 2026-05-14" at once, in four date
 * formats. Every trust surface (TrustChip via lib/trust, FreshnessChip,
 * SourceBadge, Field Notes, the hours status line and the place page's trust
 * line) now reads its vocabulary and its dates from here, so one fact is
 * always said the same way.
 *
 * Pure and dependency free (the OpenStatus import is type only), so it runs
 * in server components, client islands and specs alike.
 */

import type { OpenStatus } from "@/lib/hours";

/** Every Radius date is a Frederick County date. */
export const TRUST_TIME_ZONE = "America/New_York";

// ── Hours ──────────────────────────────────────────────────────────────────
// Ask matches the first two strings exactly (src/lib/ask/answer.ts and
// AskFrederick), so they must not drift. trust-language.spec.ts pins them.

/** Radius holds no schedule for the place at all. */
export const HOURS_NOT_POSTED = "Hours not posted";
/** Radius holds a schedule but may not assert it: too old, or never confirmed. */
export const HOURS_NOT_CONFIRMED = "Hours not confirmed";
/** A posted but unconfirmed schedule says the place is open right now. */
export const LIKELY_OPEN_CHECK_HOURS = "Likely open · check hours";

// ── Provenance ─────────────────────────────────────────────────────────────

/** A person, or Radius against a named source, checked the fact. Reserved
 *  for real checks; an automated calendar read never earns it. */
export const CHECKED_AT_SOURCE = "Checked at source";
export const RADIUS_REVIEWED = "Radius reviewed";
export const PUBLISHER_LISTING = "Publisher listing";
export const GOVERNMENT_LISTING = "Government listing";
export const COMMUNITY_SOURCE = "Community source";
export const OFFICIAL_SOURCE = "Official source";
/** An event row read automatically from a public event calendar or listing
 *  feed. It replaced "Live", which now means only "happening right now". */
export const FROM_PUBLIC_CALENDAR = "From a public calendar";

/** The place page's correction link, the last item on its trust line. */
export const REPORT_A_CHANGE = "Report a change";

// ── Open now ───────────────────────────────────────────────────────────────

/** The /open-now title. Posted hours are evidence, not a guarantee. */
export const OPEN_NOW_TITLE = "Likely open now";

/**
 * The one sentence pair under the /open-now title that states what the list
 * is based on and how far to trust it. The page says this once, here, rather
 * than repeating a caveat under every section. The count is supporting
 * detail inside the sentence, never the headline.
 */
export function openNowSummary(confirmedCount: number, likelyCount: number): string {
  if (confirmedCount > 0) {
    const subject = confirmedCount === 1 ? "1 place is" : `${confirmedCount} places are`;
    return `Recently checked hours say ${subject} open right now. Hours can still change, so check before a special trip.`;
  }
  if (likelyCount > 0) {
    return "No recently checked hours say a place is open right now. The places below are usually open at this hour, so check before you go.";
  }
  return "No recently checked hours say a place is open right now.";
}

// ── Dates ──────────────────────────────────────────────────────────────────

export type TrustTimestamp = string | number | Date | null | undefined;

type ReadTimestamp = {
  ms: number;
  /** A calendar date rather than an instant: "2026-05-20", or a stamp at
   *  exactly midnight UTC, which is how the data pipeline writes a date. It
   *  formats in UTC so it never slides back a day on Eastern time, and it is
   *  never turned into a fake "5 hours ago". */
  calendarDate: boolean;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_MIDNIGHT_RE = /T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)$/;

function readTimestamp(value: TrustTimestamp): ReadTimestamp | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === "number") {
    const ms = value instanceof Date ? value.getTime() : value;
    return Number.isFinite(ms) ? { ms, calendarDate: false } : null;
  }
  const text = value.trim();
  if (!text) return null;
  if (DATE_ONLY_RE.test(text)) {
    const ms = Date.parse(`${text}T00:00:00Z`);
    return Number.isFinite(ms) ? { ms, calendarDate: true } : null;
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return { ms, calendarDate: UTC_MIDNIGHT_RE.test(text) };
}

type ZoneFormatters = {
  monthDay: Intl.DateTimeFormat;
  monthDayYear: Intl.DateTimeFormat;
  year: Intl.DateTimeFormat;
};

function zoneFormatters(timeZone: string): ZoneFormatters {
  return {
    monthDay: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }),
    monthDayYear: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone,
    }),
    year: new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone }),
  };
}

// Built once, on first use: constructing Intl formatters is the expensive
// part, lists format a date per row, and lib/hours imports this table into
// every client bundle that shows a status line.
let formatters: { eastern: ZoneFormatters; utc: ZoneFormatters } | null = null;
function getFormatters() {
  formatters ??= { eastern: zoneFormatters(TRUST_TIME_ZONE), utc: zoneFormatters("UTC") };
  return formatters;
}

/**
 * The one date format for trust copy: "Jun 15" within the current year,
 * "May 14, 2026" otherwise. Null for a missing or unparseable value rather
 * than a guess.
 */
export function formatTrustDate(
  value: TrustTimestamp,
  now: number = Date.now(),
): string | null {
  const read = readTimestamp(value);
  if (!read) return null;
  const { eastern, utc } = getFormatters();
  const zone = read.calendarDate ? utc : eastern;
  const date = new Date(read.ms);
  const sameYear = zone.year.format(date) === eastern.year.format(new Date(now));
  return (sameYear ? zone.monthDay : zone.monthDayYear).format(date);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Clock skew between a source and this server, forgiven as "just now". */
const SKEW = 2 * MINUTE;

/**
 * How long ago a fact was read: "just now", "12 min ago" or "1 hour ago"
 * inside a day, then the trust date. A calendar date always reads as a date.
 * Null for a missing value or an instant well in the future.
 */
export function formatTrustAge(
  value: TrustTimestamp,
  now: number = Date.now(),
): string | null {
  const read = readTimestamp(value);
  if (!read) return null;
  if (read.calendarDate) return formatTrustDate(value, now);
  const diff = now - read.ms;
  if (diff < -SKEW) return null;
  if (diff < SKEW) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  return formatTrustDate(value, now);
}

function lead(prefix: string, phrase: string | null): string | null {
  return phrase ? `${prefix} ${phrase}` : null;
}

/** "Checked Jun 15". Field Notes rows and deals, one per recorded check. */
export function checkedLabel(value: TrustTimestamp, now?: number): string | null {
  return lead("Checked", formatTrustAge(value, now));
}

/** "Updated 3 hours ago" / "Updated Jun 15". A record's last change. */
export function updatedLabel(value: TrustTimestamp, now?: number): string | null {
  return lead("Updated", formatTrustAge(value, now));
}

/** What a freshness timestamp records. A human or source check keeps
 *  "checked at source"; an automated feed read says what actually happened. */
export type FreshnessBasis = "checked" | "feed";

/**
 * The FreshnessChip sentence. A check reads "Hours checked at source · Jun 15";
 * a feed row reads "Calendar read 1 hour ago".
 */
export function freshnessPhrase(
  subject: string,
  basis: FreshnessBasis,
  value: TrustTimestamp,
  now?: number,
): string | null {
  const age = formatTrustAge(value, now);
  if (!age) return null;
  return basis === "feed"
    ? `Calendar read ${age}`
    : `${subject} checked at source · ${age}`;
}

/**
 * The hours half of a trust statement, or null when the hours are confirmed
 * and the caller should state their check date instead. Mirrors
 * formatHoursLine for the states that make no open or closed claim.
 */
export function hoursTrustPhrase(status: OpenStatus): string | null {
  if (status.state === "unverified") return HOURS_NOT_CONFIRMED;
  if (status.state === "unknown") {
    return status.reason === "stale" ? HOURS_NOT_CONFIRMED : HOURS_NOT_POSTED;
  }
  return null;
}

/**
 * The place page's trust line, minus its correction link:
 * ["Details checked May 20", "Hours not confirmed"]. Absolute dates only:
 * the page is cached, so "3 hours ago" would go stale in the HTML.
 */
export function placeTrustSegments({
  detailsCheckedAt,
  hoursStatus,
  hoursCheckedAt,
  now = Date.now(),
}: {
  detailsCheckedAt?: TrustTimestamp;
  hoursStatus: OpenStatus;
  hoursCheckedAt?: TrustTimestamp;
  now?: number;
}): string[] {
  const details = formatTrustDate(detailsCheckedAt, now);
  const hoursPhrase = hoursTrustPhrase(hoursStatus);
  if (hoursPhrase) {
    return [details ? `Details checked ${details}` : null, hoursPhrase].filter(
      (segment): segment is string => Boolean(segment),
    );
  }
  const hours = formatTrustDate(hoursCheckedAt, now);
  if (details && hours === details) return [`Details and hours checked ${details}`];
  return [
    details ? `Details checked ${details}` : null,
    hours ? `Hours checked ${hours}` : null,
  ].filter((segment): segment is string => Boolean(segment));
}
