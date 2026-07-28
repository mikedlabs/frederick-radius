/**
 * Runtime-safe iCalendar parsing for the scheduled ingest routes.
 *
 * A previous bundled calendar path failed before reading a feed when
 * node-ical's Temporal dependencies reached the serverless runtime. The live
 * path already uses a small RFC 5545 boundary parser. Keep scheduled ingestion
 * dependency-free as well so both paths avoid that bundle class entirely.
 *
 * This is intentionally a VEVENT extractor, not a calendar generator. It
 * unfolds folded lines, preserves escaped text, handles the Frederick feeds'
 * UTC and America/New_York date forms, distinguishes invalid HTML from a
 * valid empty calendar, and keeps the raw VEVENT for audit evidence.
 */
import { easternWallToUtcISO } from "@/lib/tz";

export type ParsedEvent = {
  uid: string;
  summary: string;
  description?: string;
  /** Absolute URL from VEVENT URL or a URL embedded in DESCRIPTION. */
  sourceUrl?: string;
  rawLocation?: string;
  startsAtUtc: string;
  endsAtUtc?: string;
  tzid: string;
  allDay: boolean;
  /** Source timestamp used for deterministic change detection. */
  dtstamp: string;
  rawVevent: string;
};

export type ICalParseResult =
  | { valid: true; events: ParsedEvent[] }
  | { valid: false; events: []; error: string };

type Property = {
  key: string;
  params: Record<string, string>;
  value: string;
};

type RawEvent = {
  lines: string[];
  properties: Property[];
};

const URL_RE = /(https?:\/\/[^\s<>"')]+)/i;
const DATE_ONLY_RE = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME_RE =
  /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})?$/;

function unfoldLines(text: string): string[] {
  const unfolded: string[] = [];
  for (const line of text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")) {
    if (
      unfolded.length > 0 &&
      (line.startsWith(" ") || line.startsWith("\t"))
    ) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\[nN]/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function splitOutsideQuotes(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === delimiter && !quoted) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function parseProperty(line: string): Property | null {
  const headAndValue = splitOutsideQuotes(line, ":");
  if (headAndValue.length < 2) return null;
  const colon = headAndValue[0]?.length ?? -1;
  if (colon < 1) return null;

  const [rawKey, ...rawParams] = splitOutsideQuotes(
    line.slice(0, colon),
    ";",
  );
  const params: Record<string, string> = {};
  for (const rawParam of rawParams) {
    const equals = rawParam.indexOf("=");
    if (equals < 1) continue;
    params[rawParam.slice(0, equals).toUpperCase()] = rawParam
      .slice(equals + 1)
      .replace(/^"|"$/g, "");
  }

  return {
    key: rawKey.toUpperCase(),
    params,
    value: line.slice(colon + 1),
  };
}

function validDateTimeParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59 ||
    !Number.isInteger(second) ||
    second < 0 ||
    second > 59
  ) {
    return false;
  }
  const leap =
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= days[month - 1];
}

function utcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, Math.min(second, 59), 0);
  return date.toISOString();
}

function zonedParts(
  iso: string,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  try {
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA-u-hc-h23", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(iso))
        .map((part) => [part.type, part.value]),
    ) as Record<string, string>;
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour) % 24,
      minute: Number(values.minute),
      second: Number(values.second),
    };
  } catch {
    return null;
  }
}

function sameWallTime(
  actual: ReturnType<typeof zonedParts>,
  expected: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  },
): boolean {
  return Boolean(
    actual &&
      actual.year === expected.year &&
      actual.month === expected.month &&
      actual.day === expected.day &&
      actual.hour === expected.hour &&
      actual.minute === expected.minute &&
      actual.second === Math.min(expected.second, 59),
  );
}

function wallTimeIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): string | null {
  if (
    !validDateTimeParts(year, month, day, hour, minute, second)
  ) {
    return null;
  }
  const expected = { year, month, day, hour, minute, second };
  const normalizedZone = timeZone.trim();
  if (/^(?:UTC|Etc\/UTC|GMT)$/i.test(normalizedZone)) {
    return utcIso(year, month, day, hour, minute, second);
  }

  if (normalizedZone === "America/New_York") {
    const iso = easternWallToUtcISO(
      year,
      month,
      day,
      hour,
      minute,
      Math.min(second, 59),
    );
    return sameWallTime(zonedParts(iso, normalizedZone), expected)
      ? iso
      : null;
  }

  // Resolve another IANA wall clock without bringing a calendar dependency
  // back into the serverless bundle. Iterating the observed zone offset also
  // rejects nonexistent local times during the spring DST gap.
  let instant = Date.parse(utcIso(year, month, day, hour, minute, second));
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const iso = new Date(instant).toISOString();
    const actual = zonedParts(iso, normalizedZone);
    if (!actual) return null;
    if (sameWallTime(actual, expected)) return iso;
    const targetWall = Date.parse(
      utcIso(year, month, day, hour, minute, second),
    );
    const actualWall = Date.parse(
      utcIso(
        actual.year,
        actual.month,
        actual.day,
        actual.hour,
        actual.minute,
        actual.second,
      ),
    );
    instant += targetWall - actualWall;
  }
  const iso = new Date(instant).toISOString();
  return sameWallTime(zonedParts(iso, normalizedZone), expected)
    ? iso
    : null;
}

function collectEvents(lines: readonly string[]): RawEvent[] {
  const events: RawEvent[] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    const marker = line.trim().toUpperCase();
    if (marker === "BEGIN:VEVENT") {
      current = [line];
      continue;
    }
    if (!current) continue;

    current.push(line);
    if (marker !== "END:VEVENT") continue;

    events.push({
      lines: current,
      properties: current
        .slice(1, -1)
        .map(parseProperty)
        .filter((property): property is Property => property !== null),
    });
    current = null;
  }

  return events;
}

function firstProperty(
  event: RawEvent,
  key: string,
): Property | undefined {
  return event.properties.find((property) => property.key === key);
}

function offsetIso(
  year: string,
  month: string,
  day: string,
  hour: string,
  minute: string,
  second: string,
  offset: string,
): string | null {
  const sign = offset.startsWith("-") ? "-" : "+";
  const offsetHour = offset.slice(1, 3);
  const offsetMinute = offset.slice(3, 5);
  if (Number(offsetHour) > 23 || Number(offsetMinute) > 59) return null;
  const parsed = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHour}:${offsetMinute}`,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseDateProperty(property: Property | undefined): {
  iso: string;
  allDay: boolean;
  tzid: string;
  wall: { year: number; month: number; day: number };
} | null {
  if (!property) return null;

  const dateOnly = DATE_ONLY_RE.exec(property.value.trim());
  if (property.params.VALUE?.toUpperCase() === "DATE" || dateOnly) {
    if (!dateOnly) return null;
    const [, year, month, day] = dateOnly;
    const timeZone = property.params.TZID || "America/New_York";
    const iso = wallTimeIso(
      Number(year),
      Number(month),
      Number(day),
      0,
      0,
      0,
      timeZone,
    );
    if (!iso) return null;
    return {
      iso,
      allDay: true,
      tzid: timeZone,
      wall: {
        year: Number(year),
        month: Number(month),
        day: Number(day),
      },
    };
  }

  const timed = DATE_TIME_RE.exec(property.value.trim());
  if (!timed) return null;
  const [, year, month, day, hour, minute, second, suffix] = timed;
  if (
    !validDateTimeParts(
      Number(year),
      Number(month),
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    )
  ) {
    return null;
  }

  let iso: string;
  if (suffix === "Z") {
    iso = utcIso(
      Number(year),
      Number(month),
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
  } else if (suffix && /^[+-]\d{4}$/.test(suffix)) {
    const withOffset = offsetIso(
      year,
      month,
      day,
      hour,
      minute,
      second,
      suffix,
    );
    if (!withOffset) return null;
    iso = withOffset;
  } else {
    const wallIso = wallTimeIso(
      Number(year),
      Number(month),
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      property.params.TZID || "America/New_York",
    );
    if (!wallIso) return null;
    iso = wallIso;
  }

  return {
    iso,
    allDay: false,
    tzid:
      suffix === "Z"
        ? "UTC"
        : suffix
          ? `UTC${suffix.slice(0, 3)}:${suffix.slice(3)}`
          : property.params.TZID || "America/New_York",
    wall: {
      year: Number(year),
      month: Number(month),
      day: Number(day),
    },
  };
}

function nextAllDayMidnight({
  year,
  month,
  day,
}: {
  year: number;
  month: number;
  day: number;
}, timeZone: string): string | undefined {
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return wallTimeIso(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  ) ?? undefined;
}

function parseEvent(event: RawEvent): ParsedEvent | null {
  const uid = firstProperty(event, "UID")?.value.trim();
  const summaryProperty = firstProperty(event, "SUMMARY");
  const summary = summaryProperty
    ? unescapeText(summaryProperty.value).trim()
    : "";
  const start = parseDateProperty(firstProperty(event, "DTSTART"));
  if (!uid || !summary || !start) return null;

  const rawEnd = parseDateProperty(firstProperty(event, "DTEND"));
  const endsAtUtc = start.allDay
    ? rawEnd?.iso ?? nextAllDayMidnight(start.wall, start.tzid)
    : rawEnd?.iso;
  const descriptionProperty = firstProperty(event, "DESCRIPTION");
  const description = descriptionProperty
    ? unescapeText(descriptionProperty.value).trim()
    : "";
  const locationProperty = firstProperty(event, "LOCATION");
  const rawLocation = locationProperty
    ? unescapeText(locationProperty.value).trim()
    : "";
  const directUrl = firstProperty(event, "URL")?.value.trim();
  const describedUrl = description.match(URL_RE)?.[1];
  // CivicPlus publishes a relative calendar-export URL in URL and the
  // canonical absolute event page in DESCRIPTION. The public UI assumes this
  // field is independently navigable, so never let the relative export path
  // mask the useful official page.
  const sourceUrl = /^https?:\/\//i.test(directUrl ?? "")
    ? directUrl
    : describedUrl;
  const stamp = parseDateProperty(firstProperty(event, "DTSTAMP"));

  return {
    uid,
    summary,
    description: description || undefined,
    sourceUrl,
    rawLocation: rawLocation || undefined,
    startsAtUtc: start.iso,
    endsAtUtc,
    tzid: start.tzid,
    allDay: start.allDay,
    // A missing DTSTAMP should not produce a new change key on every run.
    dtstamp: stamp?.iso ?? start.iso,
    rawVevent: event.lines.join("\r\n"),
  };
}

/**
 * Parse a complete calendar while preserving valid-empty versus invalid.
 *
 * Scheduled ingestion must never treat an HTTP 200 HTML error page as a
 * healthy feed with zero events.
 */
export function parseICalResult(icsText: string): ICalParseResult {
  const lines = unfoldLines(icsText);
  const markers = lines
    .map((line) => line.trim().toUpperCase())
    .filter(Boolean);
  if (
    markers[0] !== "BEGIN:VCALENDAR" ||
    markers.at(-1) !== "END:VCALENDAR"
  ) {
    return {
      valid: false,
      events: [],
      error: "invalid iCalendar payload",
    };
  }

  const eventBegins = markers.filter(
    (marker) => marker === "BEGIN:VEVENT",
  ).length;
  const eventEnds = markers.filter(
    (marker) => marker === "END:VEVENT",
  ).length;
  const rawEvents = collectEvents(lines);
  if (
    eventBegins !== eventEnds ||
    rawEvents.length !== eventBegins
  ) {
    return {
      valid: false,
      events: [],
      error: "malformed VEVENT structure",
    };
  }

  const events = rawEvents
    .map(parseEvent)
    .filter((event): event is ParsedEvent => event !== null);
  if (rawEvents.length > 0 && events.length === 0) {
    return {
      valid: false,
      events: [],
      error: "calendar contained no usable VEVENTs",
    };
  }
  return { valid: true, events };
}

export function parseICal(icsText: string): ParsedEvent[] {
  return parseICalResult(icsText).events;
}
