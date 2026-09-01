import { cleanFeedText } from "@/lib/format/text";
import { easternWallToUtcISO } from "@/lib/tz";

export const GREAT_FREDERICK_FAIR_2026_SCHEDULE_SOURCE_URL =
  "https://thegreatfrederickfair.com/schedule/" as const;

export const GREAT_FREDERICK_FAIR_2026_START_DATE = "2026-09-18" as const;
export const GREAT_FREDERICK_FAIR_2026_END_DATE = "2026-09-26" as const;
export const GREAT_FREDERICK_FAIR_TIME_ZONE = "America/New_York" as const;

export type FairScheduleTiming =
  | "exact"
  | "range"
  | "approximate"
  | "open-ended"
  | "unspecified";

export type FairScheduleTimeOrigin = "explicit" | "inherited" | "none";

/**
 * One source row from the Fair's day table.
 *
 * This deliberately does not implement the stricter domain FairScheduleItem:
 * the publisher has rows with blank, approximate, and open-ended times. A
 * later reviewed promotion step may turn safely timed rows into domain items;
 * this boundary keeps every official row without inventing precision.
 */
export type FairScheduleSourceItem = {
  id: string;
  dayId: string;
  fairDate: string;
  /** One-based position in the publisher's table. Never used as identity. */
  sourcePosition: number;
  text: string;
  /** Exact first-cell text, or null when the publisher left it blank. */
  timeLabel: string | null;
  /** Previous explicit time label for a blank continuation row. */
  inheritedTimeLabel: string | null;
  timeOrigin: FairScheduleTimeOrigin;
  timing: FairScheduleTiming;
  /** Parsed only when the label itself supplies a usable start. */
  startsAt: string | null;
  /** Null for point times, approximate point times, and "Close" ranges. */
  endsAt: string | null;
  sourceUid: string;
  recurrenceId: string | null;
  sourceModifiedAt: string;
  sourceUrl: typeof GREAT_FREDERICK_FAIR_2026_SCHEDULE_SOURCE_URL;
};

export type FairScheduleSourceDay = {
  id: string;
  date: string;
  gateStartsAt: string;
  gateEndsAt: string;
  sourceUid: string;
  recurrenceId: string | null;
  sourceModifiedAt: string;
  items: FairScheduleSourceItem[];
};

export type FairScheduleDiagnostic = {
  level: "warning" | "error";
  code:
    | "invalid_calendar"
    | "missing_opening_day"
    | "ambiguous_opening_day"
    | "missing_master"
    | "ambiguous_master"
    | "unsupported_rrule"
    | "unsupported_recurrence_override"
    | "unexpected_recurrence_range"
    | "missing_override"
    | "ambiguous_override"
    | "cancelled_occurrence"
    | "unsupported_event_status"
    | "invalid_event_window"
    | "moved_occurrence"
    | "missing_last_modified"
    | "missing_day_table"
    | "unexpected_table_shape"
    | "unparsed_time_label";
  message: string;
  fairDate?: string;
};

export type FairScheduleParseStats = {
  calendarEventCount: number;
  selectedEventCount: number;
  dayCount: number;
  itemCount: number;
  blankTimeLabelCount: number;
  inheritedTimeLabelCount: number;
};

export type FairScheduleParseResult = {
  ok: boolean;
  days: FairScheduleSourceDay[];
  items: FairScheduleSourceItem[];
  sourceRevision: string | null;
  diagnostics: FairScheduleDiagnostic[];
  stats: FairScheduleParseStats;
};

type IcalProperty = {
  key: string;
  params: Record<string, string>;
  value: string;
  invalidParams?: boolean;
};

type RawVEvent = {
  properties: IcalProperty[];
};

type ParsedDateTime = {
  iso: string;
  fairDate: string;
};

type FairVEvent = {
  uid: string;
  summary: string;
  description: string;
  start: ParsedDateTime | null;
  end: ParsedDateTime | null;
  recurrenceId: ParsedDateTime | null;
  recurrenceRange: string | null;
  rrule: string | null;
  exdates: string[];
  lastModified: string | null;
  sequence: number;
  status: string;
};

const EMPTY_STATS: FairScheduleParseStats = {
  calendarEventCount: 0,
  selectedEventCount: 0,
  dayCount: 0,
  itemCount: 0,
  blankTimeLabelCount: 0,
  inheritedTimeLabelCount: 0,
};

function unfoldIcalLines(text: string): string[] {
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

function firstUnquotedColon(line: string): number {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
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
    if (character === ":" && !quoted) return index;
  }
  return -1;
}

function parseProperty(line: string): IcalProperty | null {
  const colon = firstUnquotedColon(line);
  if (colon < 1) return null;
  const head = line.slice(0, colon);
  const [rawKey, ...rawParams] = head.split(";");
  const params: Record<string, string> = {};
  let invalidParams = false;
  for (const rawParam of rawParams) {
    const equals = rawParam.indexOf("=");
    if (equals < 1) {
      invalidParams = true;
      continue;
    }
    const paramKey = rawParam.slice(0, equals).toUpperCase();
    if (paramKey in params) invalidParams = true;
    params[paramKey] = rawParam
      .slice(equals + 1)
      .replace(/^"|"$/g, "");
  }
  return {
    key: rawKey.toUpperCase(),
    params,
    value: line.slice(colon + 1),
    invalidParams,
  };
}

function collectEvents(lines: readonly string[]): RawVEvent[] | null {
  const events: RawVEvent[] = [];
  let current: IcalProperty[] | null = null;
  let begins = 0;
  let ends = 0;

  for (const line of lines) {
    const marker = line.trim().toUpperCase();
    if (marker === "BEGIN:VEVENT") {
      begins += 1;
      if (current) return null;
      current = [];
      continue;
    }
    if (marker === "END:VEVENT") {
      ends += 1;
      if (!current) return null;
      events.push({ properties: current });
      current = null;
      continue;
    }
    if (!current) continue;
    const property = parseProperty(line);
    if (property) current.push(property);
  }

  return current || begins !== ends ? null : events;
}

function firstProperty(
  event: RawVEvent,
  key: string,
): IcalProperty | undefined {
  return event.properties.find((property) => property.key === key);
}

function properties(event: RawVEvent, key: string): IcalProperty[] {
  return event.properties.filter((property) => property.key === key);
}

function unescapeIcalText(value: string): string {
  return value
    .replace(/\\[nN]/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function dateInFairTimeZone(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GREAT_FREDERICK_FAIR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parseDateTime(property: IcalProperty | undefined): ParsedDateTime | null {
  if (!property) return null;
  if (property.invalidParams) return null;

  const allowedParams = property.key === "RECURRENCE-ID"
    ? new Set(["TZID", "VALUE", "RANGE"])
    : new Set(["TZID", "VALUE"]);
  if (Object.keys(property.params).some((key) => !allowedParams.has(key))) {
    return null;
  }
  if (
    property.params.VALUE &&
    property.params.VALUE.toUpperCase() !== "DATE-TIME"
  ) {
    return null;
  }

  const value = property.value.trim();
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(
    value,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second, suffix] = match;
  const numbers = [year, month, day, hour, minute, second].map(Number);
  const componentCheck = new Date(
    Date.UTC(
      numbers[0],
      numbers[1] - 1,
      numbers[2],
      numbers[3],
      numbers[4],
      numbers[5],
    ),
  );
  if (
    componentCheck.getUTCFullYear() !== numbers[0] ||
    componentCheck.getUTCMonth() + 1 !== numbers[1] ||
    componentCheck.getUTCDate() !== numbers[2] ||
    componentCheck.getUTCHours() !== numbers[3] ||
    componentCheck.getUTCMinutes() !== numbers[4] ||
    componentCheck.getUTCSeconds() !== numbers[5]
  ) {
    return null;
  }

  const timeZone = property.params.TZID;
  if (
    suffix === "Z"
      ? Boolean(timeZone)
      : timeZone !== GREAT_FREDERICK_FAIR_TIME_ZONE
  ) {
    return null;
  }
  const iso = suffix === "Z"
    ? componentCheck.toISOString()
    : easternWallToUtcISO(
        numbers[0],
        numbers[1],
        numbers[2],
        numbers[3],
        numbers[4],
        numbers[5],
      );
  if (Number.isNaN(Date.parse(iso))) return null;

  if (!suffix) {
    const localParts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: GREAT_FREDERICK_FAIR_TIME_ZONE,
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
    if (
      Number(localParts.year) !== numbers[0] ||
      Number(localParts.month) !== numbers[1] ||
      Number(localParts.day) !== numbers[2] ||
      Number(localParts.hour) !== numbers[3] ||
      Number(localParts.minute) !== numbers[4] ||
      Number(localParts.second) !== numbers[5]
    ) {
      return null;
    }
  }
  return { iso, fairDate: dateInFairTimeZone(iso) };
}

function parseEvent(event: RawVEvent): FairVEvent | null {
  const uid = firstProperty(event, "UID")?.value.trim() ?? "";
  const summary = unescapeIcalText(
    firstProperty(event, "SUMMARY")?.value ?? "",
  ).trim();
  if (!uid || !summary) return null;

  const exdates = properties(event, "EXDATE").flatMap((property) =>
    property.value
      .split(",")
      .map((value) => parseDateTime({ ...property, value })?.fairDate)
      .filter((value): value is string => Boolean(value)),
  );

  const recurrenceProperty = firstProperty(event, "RECURRENCE-ID");
  return {
    uid,
    summary,
    description: unescapeIcalText(
      firstProperty(event, "DESCRIPTION")?.value ?? "",
    ),
    start: parseDateTime(firstProperty(event, "DTSTART")),
    end: parseDateTime(firstProperty(event, "DTEND")),
    recurrenceId: parseDateTime(recurrenceProperty),
    recurrenceRange: recurrenceProperty?.params.RANGE?.toUpperCase() ?? null,
    rrule: firstProperty(event, "RRULE")?.value.trim() ?? null,
    exdates,
    lastModified: parseDateTime(firstProperty(event, "LAST-MODIFIED"))?.iso ?? null,
    sequence: Number(firstProperty(event, "SEQUENCE")?.value ?? 0) || 0,
    status: firstProperty(event, "STATUS")?.value.trim().toUpperCase() ?? "CONFIRMED",
  };
}

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const final = new Date(`${end}T00:00:00Z`);
  while (cursor <= final) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function expectedRecurrenceDates(master: FairVEvent): string[] | null {
  if (!master.start || !master.rrule) return null;
  const allowedKeys = new Set(["FREQ", "UNTIL", "INTERVAL"]);
  const rule = new Map<string, string>();
  for (const rawPart of master.rrule.split(";")) {
    const equals = rawPart.indexOf("=");
    if (equals < 1 || equals === rawPart.length - 1) return null;
    const key = rawPart.slice(0, equals).toUpperCase();
    const value = rawPart.slice(equals + 1);
    if (!allowedKeys.has(key) || rule.has(key)) return null;
    rule.set(key, value);
  }
  if (
    rule.get("FREQ")?.toUpperCase() !== "DAILY" ||
    !rule.has("UNTIL") ||
    (rule.has("INTERVAL") && rule.get("INTERVAL") !== "1")
  ) {
    return null;
  }
  const until = parseDateTime({
    key: "UNTIL",
    params: {},
    value: rule.get("UNTIL") ?? "",
  });
  if (!until) return null;
  const excluded = new Set(master.exdates);
  return enumerateDates(master.start.fairDate, until.fairDate).filter(
    (date) => !excluded.has(date),
  );
}

function validatePublishedEvent(
  event: FairVEvent,
  fairDate: string,
  diagnostics: FairScheduleDiagnostic[],
): boolean {
  if (event.status === "CANCELLED") {
    diagnostics.push({
      level: "error",
      code: "cancelled_occurrence",
      fairDate,
      message: `The Fair occurrence for ${fairDate} is cancelled; the reviewed nine-day schedule is incomplete.`,
    });
    return false;
  }
  if (event.status !== "CONFIRMED") {
    diagnostics.push({
      level: "error",
      code: "unsupported_event_status",
      fairDate,
      message: `The Fair occurrence for ${fairDate} has unsupported status ${event.status || "UNKNOWN"}.`,
    });
    return false;
  }
  if (
    !event.start ||
    !event.end ||
    Date.parse(event.end.iso) <= Date.parse(event.start.iso)
  ) {
    diagnostics.push({
      level: "error",
      code: "invalid_event_window",
      fairDate,
      message: `The Fair occurrence for ${fairDate} has an invalid DTSTART or DTEND.`,
    });
    return false;
  }
  if (
    event.start.fairDate !== fairDate ||
    event.end.fairDate !== fairDate
  ) {
    diagnostics.push({
      level: "error",
      code: "moved_occurrence",
      fairDate,
      message: `The Fair occurrence for ${fairDate} moved outside its reviewed Fair day.`,
    });
    return false;
  }
  return true;
}

function stableHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${
    (second >>> 0).toString(16).padStart(8, "0")
  }`;
}

function localTimestamp(date: string, minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`;
}

type Clock = { minutes: number; meridiem: "a" | "p" };

function parseClock(value: string, fallback?: "a" | "p"): Clock | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^approx\.?\s*/, "")
    .replace(/\s+/g, " ");
  if (normalized === "noon" || normalized === "12 noon") {
    return { minutes: 12 * 60, meridiem: "p" };
  }
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m\.?)?$/.exec(
    normalized,
  );
  if (!match) return null;
  const rawHour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = (match[3] as "a" | "p" | undefined) ?? fallback;
  if (!meridiem || rawHour < 1 || rawHour > 12 || minute > 59) return null;
  const hour = rawHour % 12 + (meridiem === "p" ? 12 : 0);
  return { minutes: hour * 60 + minute, meridiem };
}

function parseTimeLabel(
  fairDate: string,
  effectiveLabel: string | null,
): Pick<FairScheduleSourceItem, "timing" | "startsAt" | "endsAt"> {
  if (!effectiveLabel) {
    return { timing: "unspecified", startsAt: null, endsAt: null };
  }

  const approximate = /^approx\.?\s/i.test(effectiveLabel);
  const openEnded = /\bclose\b/i.test(effectiveLabel);
  const pieces = effectiveLabel.split(/\s*-\s*/).map((part) => part.trim());
  const end = pieces.length > 1 && !openEnded
    ? parseClock(pieces.at(-1) ?? "")
    : null;
  const start = parseClock(pieces[0] ?? "", end?.meridiem);
  const timing: FairScheduleTiming = approximate
    ? "approximate"
    : openEnded
      ? "open-ended"
      : pieces.length > 1
        ? "range"
        : "exact";

  return {
    // A label that we cannot resolve stays visible, but it cannot claim a
    // timing precision. Consumers may sort it as untimed and show the source
    // wording without treating a guessed clock as fact.
    timing: start ? timing : "unspecified",
    startsAt: start ? localTimestamp(fairDate, start.minutes) : null,
    endsAt: end ? localTimestamp(fairDate, end.minutes) : null,
  };
}

function normalizedIdentityPart(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseDayRows(
  event: FairVEvent,
  fairDate: string,
  diagnostics: FairScheduleDiagnostic[],
): FairScheduleSourceItem[] {
  const rowMatches = [...event.description.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rowMatches.length === 0) {
    diagnostics.push({
      level: "error",
      code: "missing_day_table",
      fairDate,
      message: `The ${fairDate} Fair occurrence has no schedule table rows.`,
    });
    return [];
  }

  const items: FairScheduleSourceItem[] = [];
  const idCounts = new Map<string, number>();
  let previousExplicitTime: string | null = null;

  rowMatches.forEach((rowMatch, index) => {
    const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((cell) => cleanFeedText(cell[1]));
    if (cells.length !== 3 || cells[1] !== "") {
      diagnostics.push({
        level: "error",
        code: "unexpected_table_shape",
        fairDate,
        message: `Schedule row ${index + 1} on ${fairDate} no longer has the reviewed three-cell shape.`,
      });
      return;
    }

    const timeLabel = cells[0] || null;
    const inheritedTimeLabel = timeLabel ? null : previousExplicitTime;
    const effectiveTimeLabel = timeLabel ?? inheritedTimeLabel;
    if (timeLabel) previousExplicitTime = timeLabel;
    const text = cells[2];
    if (!text) {
      diagnostics.push({
        level: "error",
        code: "unexpected_table_shape",
        fairDate,
        message: `Schedule row ${index + 1} on ${fairDate} has no event text.`,
      });
      return;
    }

    const parsedTime = parseTimeLabel(fairDate, effectiveTimeLabel);
    if (effectiveTimeLabel && !parsedTime.startsAt) {
      diagnostics.push({
        level: "warning",
        code: "unparsed_time_label",
        fairDate,
        message: `Kept unparsed Fair time label "${effectiveTimeLabel}" on ${fairDate}.`,
      });
    }

    const identity = stableHash(
      [
        fairDate,
        normalizedIdentityPart(effectiveTimeLabel ?? "untimed"),
        normalizedIdentityPart(text),
      ].join("\u0000"),
    );
    const baseId = `schedule-${fairDate}-${identity}`;
    const ordinal = (idCounts.get(baseId) ?? 0) + 1;
    idCounts.set(baseId, ordinal);

    items.push({
      id: ordinal === 1 ? baseId : `${baseId}-${ordinal}`,
      dayId: `day-${fairDate}`,
      fairDate,
      sourcePosition: index + 1,
      text,
      timeLabel,
      inheritedTimeLabel,
      timeOrigin: timeLabel
        ? "explicit"
        : inheritedTimeLabel
          ? "inherited"
          : "none",
      ...parsedTime,
      sourceUid: event.uid,
      recurrenceId: event.recurrenceId?.iso ?? null,
      sourceModifiedAt: event.lastModified ?? "",
      sourceUrl: GREAT_FREDERICK_FAIR_2026_SCHEDULE_SOURCE_URL,
    });
  });

  return items;
}

function emptyResult(
  diagnostics: FairScheduleDiagnostic[],
  stats: FairScheduleParseStats = EMPTY_STATS,
): FairScheduleParseResult {
  return {
    ok: false,
    days: [],
    items: [],
    sourceRevision: null,
    diagnostics,
    stats,
  };
}

/**
 * Parse the reviewed 2026 Google Calendar shape into Fair source rows.
 *
 * This adapter is intentionally year- and publisher-specific. It fails closed
 * when recurrence coverage or table shape drifts, rather than publishing a
 * partial schedule as if it were complete.
 */
export function parseGreatFrederickFair2026Schedule(
  icalText: string,
): FairScheduleParseResult {
  const diagnostics: FairScheduleDiagnostic[] = [];
  const lines = unfoldIcalLines(icalText);
  const markers = lines.map((line) => line.trim().toUpperCase()).filter(Boolean);
  if (
    markers[0] !== "BEGIN:VCALENDAR" ||
    markers.at(-1) !== "END:VCALENDAR"
  ) {
    return emptyResult([
      {
        level: "error",
        code: "invalid_calendar",
        message: "The Fair schedule source is not a complete iCalendar payload.",
      },
    ]);
  }

  const rawEvents = collectEvents(lines);
  if (!rawEvents) {
    return emptyResult([
      {
        level: "error",
        code: "invalid_calendar",
        message: "The Fair schedule source has malformed VEVENT boundaries.",
      },
    ]);
  }
  const parsedEvents = rawEvents
    .map(parseEvent)
    .filter((event): event is FairVEvent => event !== null);
  const selected = parsedEvents.filter((event) => {
    if (event.summary.trim().toUpperCase() !== "THE GREAT FREDERICK FAIR") {
      return false;
    }
    const date = event.recurrenceId?.fairDate ?? event.start?.fairDate;
    return Boolean(
      date &&
      date >= GREAT_FREDERICK_FAIR_2026_START_DATE &&
      date <= GREAT_FREDERICK_FAIR_2026_END_DATE,
    );
  });
  const baseStats = {
    ...EMPTY_STATS,
    calendarEventCount: rawEvents.length,
    selectedEventCount: selected.length,
  };

  const rangedOverride = selected.find((event) => event.recurrenceRange);
  if (rangedOverride) {
    return emptyResult(
      [
        {
          level: "error",
          code: "unsupported_recurrence_override",
          fairDate: rangedOverride.recurrenceId?.fairDate,
          message: `The Fair source uses unsupported RECURRENCE-ID RANGE=${rangedOverride.recurrenceRange}.`,
        },
      ],
      baseStats,
    );
  }

  const openingDays = selected.filter(
    (event) =>
      !event.rrule &&
      !event.recurrenceId &&
      event.start?.fairDate === GREAT_FREDERICK_FAIR_2026_START_DATE,
  );
  if (openingDays.length === 0) {
    diagnostics.push({
      level: "error",
      code: "missing_opening_day",
      fairDate: GREAT_FREDERICK_FAIR_2026_START_DATE,
      message: "The standalone 2026 Fair opening-day event is missing.",
    });
  } else if (openingDays.length > 1) {
    diagnostics.push({
      level: "error",
      code: "ambiguous_opening_day",
      fairDate: GREAT_FREDERICK_FAIR_2026_START_DATE,
      message: "More than one standalone 2026 Fair opening-day event was found.",
    });
  }

  const masters = selected.filter((event) => Boolean(event.rrule));
  if (masters.length === 0) {
    diagnostics.push({
      level: "error",
      code: "missing_master",
      message: "The Sep. 19-26 Fair recurrence master is missing.",
    });
  } else if (masters.length > 1) {
    diagnostics.push({
      level: "error",
      code: "ambiguous_master",
      message: "More than one 2026 Fair recurrence master was found.",
    });
  }
  if (diagnostics.some((diagnostic) => diagnostic.level === "error")) {
    return emptyResult(diagnostics, baseStats);
  }

  const opening = openingDays[0];
  const master = masters[0];
  validatePublishedEvent(
    opening,
    GREAT_FREDERICK_FAIR_2026_START_DATE,
    diagnostics,
  );
  validatePublishedEvent(master, "2026-09-19", diagnostics);
  if (diagnostics.some((diagnostic) => diagnostic.level === "error")) {
    return emptyResult(diagnostics, baseStats);
  }

  const recurrenceDates = expectedRecurrenceDates(master);
  if (!recurrenceDates) {
    return emptyResult(
      [
        ...diagnostics,
        {
          level: "error",
          code: "unsupported_rrule",
          message: "The 2026 Fair master is no longer a bounded daily recurrence.",
        },
      ],
      baseStats,
    );
  }
  const expectedDates = enumerateDates("2026-09-19", GREAT_FREDERICK_FAIR_2026_END_DATE);
  // EXDATE is honored while resolving the source recurrence, but this adapter
  // promises a complete reviewed nine-day schedule. An exclusion therefore
  // fails closed here instead of quietly publishing an eight-day result.
  if (recurrenceDates.join(",") !== expectedDates.join(",")) {
    return emptyResult(
      [
        ...diagnostics,
        {
          level: "error",
          code: "unexpected_recurrence_range",
          message: `The Fair recurrence resolves to ${recurrenceDates.join(", ")}, not the reviewed Sep. 19-26 range.`,
        },
      ],
      baseStats,
    );
  }

  const overridesByDate = new Map<string, FairVEvent[]>();
  for (const event of selected) {
    if (event.uid !== master.uid || !event.recurrenceId) continue;
    const date = event.recurrenceId.fairDate;
    const group = overridesByDate.get(date) ?? [];
    group.push(event);
    overridesByDate.set(date, group);
  }

  const resolvedOverrides = new Map<string, FairVEvent>();
  for (const date of recurrenceDates) {
    const candidates = overridesByDate.get(date) ?? [];
    if (candidates.length === 0) {
      diagnostics.push({
        level: "error",
        code: "missing_override",
        fairDate: date,
        message: `The rich Fair schedule override for ${date} is missing.`,
      });
      continue;
    }
    if (candidates.length > 1) {
      candidates.sort(
        (left, right) =>
          right.sequence - left.sequence ||
          Date.parse(right.lastModified ?? "") - Date.parse(left.lastModified ?? ""),
      );
      const first = candidates[0];
      const second = candidates[1];
      if (
        first.sequence === second.sequence &&
        first.lastModified === second.lastModified
      ) {
        diagnostics.push({
          level: "error",
          code: "ambiguous_override",
          fairDate: date,
          message: `The Fair source has indistinguishable duplicate overrides for ${date}.`,
        });
        continue;
      }
      diagnostics.push({
        level: "warning",
        code: "ambiguous_override",
        fairDate: date,
        message: `Used the highest-sequence Fair override for ${date}.`,
      });
    }
    const resolved = candidates[0];
    if (!validatePublishedEvent(resolved, date, diagnostics)) continue;
    resolvedOverrides.set(date, resolved);
  }

  const dayEvents = [
    opening,
    ...recurrenceDates.map((date) => resolvedOverrides.get(date)).filter(
      (event): event is FairVEvent => Boolean(event),
    ),
  ];
  for (const event of [master, ...dayEvents]) {
    if (!event.lastModified) {
      diagnostics.push({
        level: "error",
        code: "missing_last_modified",
        fairDate: event.recurrenceId?.fairDate ?? event.start?.fairDate,
        message: `Fair source event ${event.uid} has no LAST-MODIFIED provenance.`,
      });
    }
  }
  if (diagnostics.some((diagnostic) => diagnostic.level === "error")) {
    return emptyResult(diagnostics, baseStats);
  }

  const days: FairScheduleSourceDay[] = dayEvents.map((event) => {
    const date = event.recurrenceId?.fairDate ?? event.start?.fairDate ?? "";
    const items = parseDayRows(event, date, diagnostics);
    return {
      id: `day-${date}`,
      date,
      gateStartsAt: event.start?.iso ?? "",
      gateEndsAt: event.end?.iso ?? "",
      sourceUid: event.uid,
      recurrenceId: event.recurrenceId?.iso ?? null,
      sourceModifiedAt: event.lastModified ?? "",
      items,
    };
  });
  if (diagnostics.some((diagnostic) => diagnostic.level === "error")) {
    return emptyResult(diagnostics, baseStats);
  }

  days.sort((left, right) => left.date.localeCompare(right.date));
  const items = days.flatMap((day) => day.items);
  const sourceRevision = [master, ...dayEvents]
    .map((event) => event.lastModified)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const stats: FairScheduleParseStats = {
    ...baseStats,
    dayCount: days.length,
    itemCount: items.length,
    blankTimeLabelCount: items.filter((item) => item.timeLabel === null).length,
    inheritedTimeLabelCount: items.filter(
      (item) => item.timeOrigin === "inherited",
    ).length,
  };

  return {
    ok: true,
    days,
    items,
    sourceRevision,
    diagnostics,
    stats,
  };
}
