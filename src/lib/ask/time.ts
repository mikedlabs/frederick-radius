import { easternDayKey, easternParts, easternWallToUtcISO } from "@/lib/tz";

const WEEKDAYS: Readonly<Record<string, number>> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MONTHS: Readonly<Record<string, number>> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

type CalendarDate = { year: number; month: number; day: number };

export type ParsedAskDateTime = {
  dateKey: string | null;
  dateLabel: string | null;
  timeLabel: string | null;
  hour: number | null;
  minute: number | null;
  instant: Date | null;
  explicitDate: boolean;
  explicitTime: boolean;
};

function validDate(year: number, month: number, day: number): CalendarDate | null {
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function dateKey(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function dateLabel(date: CalendarDate): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}

function resolveDate(query: string, now: Date): { date: CalendarDate | null; explicit: boolean } {
  const q = query.toLowerCase();
  const currentParts = easternParts(now);
  const today = { year: currentParts.year, month: currentParts.month, day: currentParts.day };

  if (/\btomorrow\b/.test(q)) return { date: addDays(today, 1), explicit: true };
  if (/\b(?:today|tonight|this morning|this afternoon|this evening)\b/.test(q)) {
    return { date: today, explicit: true };
  }

  const iso = q.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return { date: validDate(Number(iso[1]), Number(iso[2]), Number(iso[3])), explicit: true };
  }

  const slash = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/);
  if (slash) {
    let year = slash[3] ? Number(slash[3]) : today.year;
    if (year < 100) year += 2000;
    let date = validDate(year, Number(slash[1]), Number(slash[2]));
    if (date && !slash[3] && dateKey(date) < dateKey(today)) {
      date = validDate(year + 1, date.month, date.day);
    }
    return { date, explicit: true };
  }

  const monthNames = Object.keys(MONTHS).join("|");
  const named = q.match(new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`, "i"));
  if (named) {
    const year = named[3] ? Number(named[3]) : today.year;
    let date = validDate(year, MONTHS[named[1].toLowerCase()], Number(named[2]));
    if (date && !named[3] && dateKey(date) < dateKey(today)) {
      date = validDate(year + 1, date.month, date.day);
    }
    return { date, explicit: true };
  }

  const weekday = Object.entries(WEEKDAYS).find(([name]) => new RegExp(`\\b(?:this |next )?${name}\\b`, "i").test(q));
  if (weekday) {
    const [, target] = weekday;
    let delta = (target - currentParts.weekday + 7) % 7;
    const explicitlyNext = new RegExp(`\\bnext ${weekday[0]}\\b`, "i").test(q);
    if (explicitlyNext && delta === 0) delta = 7;
    return { date: addDays(today, delta), explicit: true };
  }

  return { date: null, explicit: false };
}

function inferMeridiem(query: string, hour: number): "AM" | "PM" | null {
  if (/\b(?:breakfast|brunch|morning|coffee|cafe|bakery)\b/i.test(query)) return "AM";
  if (/\b(?:lunch|afternoon|dinner|supper|evening|tonight|date[-\s]+night|show|concert|live music)\b/i.test(query)) return "PM";
  // In conversational planning, "at 7" overwhelmingly means evening. Keep
  // noon and midnight ambiguous rather than manufacturing a choice.
  if (hour >= 1 && hour <= 7) return "PM";
  return null;
}

function resolveTime(query: string): { hour: number | null; minute: number | null; label: string | null; explicit: boolean } {
  const matches = [...query.matchAll(/\b(?:at|for|around|by)\s*(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\b/gi)]
    .filter((match) => !/^\s*(?:people|persons?|guests?|adults?)\b/i.test(query.slice((match.index ?? 0) + match[0].length)))
    .sort((a, b) => {
      const score = (match: RegExpMatchArray) => (match[3] ? 4 : 0) + (match[2] ? 2 : 0) + (/^at\b/i.test(match[0]) ? 1 : 0);
      return score(b) - score(a) || (b.index ?? 0) - (a.index ?? 0);
    });
  const clock = matches[0];
  if (!clock) return { hour: null, minute: null, label: null, explicit: false };
  const rawHour = Number(clock[1]);
  const minute = Number(clock[2] ?? "0");
  if (!Number.isInteger(rawHour) || rawHour < 0 || rawHour > 23) {
    return { hour: null, minute: null, label: null, explicit: false };
  }

  const supplied = clock[3]?.toUpperCase().replaceAll(".", "") as "AM" | "PM" | undefined;
  if (rawHour > 12 && supplied) return { hour: null, minute: null, label: null, explicit: false };
  const meridiem = supplied ?? (rawHour <= 12 ? inferMeridiem(query, rawHour) : null);
  let hour = rawHour;
  if (meridiem) {
    if (rawHour < 1 || rawHour > 12) return { hour: null, minute: null, label: null, explicit: false };
    hour = rawHour % 12 + (meridiem === "PM" ? 12 : 0);
  }
  const labelMeridiem = hour >= 12 ? "PM" : "AM";
  const labelHour = hour % 12 || 12;
  return {
    hour,
    minute,
    label: `${labelHour}:${String(minute).padStart(2, "0")} ${labelMeridiem}`,
    explicit: true,
  };
}

/** Parse the calendar language Ask supports, always as Frederick wall time. */
export function parseAskDateTime(query: string, now = new Date()): ParsedAskDateTime {
  const resolvedDate = resolveDate(query, now);
  const resolvedTime = resolveTime(query);
  let date = resolvedDate.date;

  // A clock without a named date means the next occurrence. This prevents a
  // 7:30 PM booking request made at 9 PM from silently handing off yesterday.
  if (!date && resolvedTime.hour != null && resolvedTime.minute != null) {
    const current = easternParts(now);
    date = { year: current.year, month: current.month, day: current.day };
    const candidate = new Date(easternWallToUtcISO(date.year, date.month, date.day, resolvedTime.hour, resolvedTime.minute));
    if (candidate.getTime() < now.getTime()) date = addDays(date, 1);
  }

  const instant = date && resolvedTime.hour != null && resolvedTime.minute != null
    ? new Date(easternWallToUtcISO(date.year, date.month, date.day, resolvedTime.hour, resolvedTime.minute))
    : null;
  return {
    dateKey: date ? dateKey(date) : null,
    dateLabel: date ? dateLabel(date) : null,
    timeLabel: resolvedTime.label,
    hour: resolvedTime.hour,
    minute: resolvedTime.minute,
    instant,
    explicitDate: resolvedDate.explicit,
    explicitTime: resolvedTime.explicit,
  };
}

export function eventOccursOnDate(
  event: { starts_at: string; ends_at: string; is_all_day?: boolean },
  day: string,
): boolean {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
  return easternDayKey(start) === day || (start < end && easternDayKey(start) <= day && easternDayKey(end) >= day);
}
