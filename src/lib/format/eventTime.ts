/**
 * The single source of truth for rendering event times.
 *
 * Frederick events are stored as UTC instants (see lib/tz.ts for the
 * storage spine). Every user-facing event time must render in
 * America/New_York, never in UTC or browser-local time. The previous bug
 * was the Events list rendering the correct UTC instant without a
 * timezone, so it showed four hours early.
 *
 * Built from Intl parts so the output is stable ASCII ("8:00 PM" with a
 * normal space), independent of the ICU version's AM/PM separator.
 */

export const EVENT_TZ = "America/New_York";

function nyParts(iso: string): Record<string, string> {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(iso))) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out;
}

/** "8:00 PM" in America/New_York. */
export function formatEventTime(iso: string): string {
  const p = nyParts(iso);
  return `${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()}`;
}

/** "Sat, May 16" in America/New_York. */
export function formatEventDate(iso: string): string {
  const p = nyParts(iso);
  return `${p.weekday}, ${p.month} ${p.day}`;
}

const COUNTY_CITIES = [
  "Frederick", "Brunswick", "Thurmont", "Middletown", "Walkersville",
  "Emmitsburg", "New Market", "Mount Airy", "Myersville", "Woodsboro",
  "Burkittsville", "Rosemont", "Urbana",
];
// A lowercase letter running straight into a county city name is the
// signature of an address jammed into venue_name with no separator.
const CITY_RUNIN = new RegExp(`([a-z])(${COUNTY_CITIES.join("|")})\\b`, "g");

/**
 * A venue string fit for a one-line meta. Source feeds are dirty:
 * they jam a full address into venue_name with no separator
 * ("310 Baughmans LaneFrederick, MD 21701") and leak escaped markup
 * ("First Floor Hearing Room&lt;br&gt;Winchester Hall"). Display-only
 * and defensive: decode one layer of entities, turn block tags into
 * separators, strip the rest, repair the city run-in, then drop the
 * trailing "City, MD ZIP" tail. The stored value is never mutated;
 * ingest owns the source. A clean name is returned unchanged.
 */
export function venueLabel(raw?: string | null): string {
  if (!raw) return "";
  let s = raw;
  // Some feeds double-escape embedded markup; decode one layer.
  s = s.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
  // Block tags become a separator; any remaining tag becomes a space.
  s = s.replace(/<\s*br\s*\/?\s*>/gi, ", ").replace(/<\/?[a-z][^>]*>/gi, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*39;|&rsquo;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
  s = s.trim().replace(/\s+/g, " ");
  s = s.replace(CITY_RUNIN, "$1, $2");
  s = s.replace(/,?\s*(?:[A-Za-z.\s]+,\s*)?MD\s*\d{5}(?:-\d{4})?\s*$/i, "");
  s = s.replace(/(?:\s*,\s*){2,}/g, ", ");
  s = s.replace(/^[\s,;]+/, "").replace(/[\s,;]+$/, "").trim();
  return s;
}

/**
 * The display building blocks for a single event, all in
 * America/New_York. Use this for chip layouts that stack the month and
 * day separately.
 */
export function eventDateParts(iso: string): {
  weekdayShort: string;
  monthShort: string;
  monthShortUpper: string;
  day: string;
  time: string;
} {
  const p = nyParts(iso);
  return {
    weekdayShort: p.weekday,
    monthShort: p.month,
    monthShortUpper: p.month.toUpperCase(),
    day: p.day,
    time: `${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()}`,
  };
}
