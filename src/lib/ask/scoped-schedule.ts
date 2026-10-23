import type { DayOfWeek, Hours, HoursQualification, HoursWindow } from "@/data/places";
import { hoursForDate, isDisplayOnlyHours, isScheduleEvidenceCurrent } from "@/lib/hours";
import { HOURS_MAX_AGE_DAYS, isHoursFresh } from "@/lib/hours-freshness";
import { isCalendarDate, WEEKDAYS } from "@/lib/official-hours";
import { QUALIFIED_HOURS_SOURCES } from "@/lib/qualified-hours-sources";
import { easternDayKey } from "@/lib/tz";

type ScopedSchedulePlace = {
  slug: string;
  category?: string;
  website?: string;
  hours?: Hours;
  hours_verified?: boolean;
  hours_updated_at?: string;
  hours_source?: string;
};
export type AskScopedSchedule = {
  label: string;
  scope: HoursQualification["scope"];
  note: string;
  usage: "display_only";
  source_url: string;
  observed_at: string;
  expires_at: string;
  posted_weekly: Record<DayOfWeek, HoursWindow[]>;
  today: { date: string; periods: HoursWindow[]; exception_reason?: string };
};
const clock = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const plain = (value: unknown, max: number): value is string => typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= max && !/[<>\u0000-\u001f\u007f]/.test(value);
function host(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.hostname.replace(/^www\./, "") : undefined;
  } catch { return undefined; }
}

/** Existing reviewed first-party data only. This separate field never supplies
 * or changes a general venue-opening predicate. No fetch or source refresh. */
export function askScopedSchedule(place: ScopedSchedulePlace, now = new Date()): AskScopedSchedule | undefined {
  const source = QUALIFIED_HOURS_SOURCES.find((item) => item.slug === place.slug);
  const hours = place.hours, e = hours?._official, q = e?.qualification;
  if (!source || !hours || !e || !q || !Number.isFinite(now.getTime())
    || place.hours_verified !== true || place.hours_source !== "first_party"
    || place.category !== source.category || host(place.website) !== host(source.url)
    || e.slug !== source.slug || e.source_url !== source.url || e.source_name !== source.name
    || e.kind !== "merchant" || e.schedule_kind !== "weekly" || !Array.isArray(e.exceptions)
    || place.hours_updated_at !== e.observed_at || !isHoursFresh(place.hours_updated_at, now)
    || !isDisplayOnlyHours(hours) || !isScheduleEvidenceCurrent(hours, now)
    || !["venue", "kitchen", "bar", "brunch", "admission"].includes(q.scope)
    || !plain(q.label, 80) || !plain(q.note, 500)
    || Date.parse(e.expires_at) !== Date.parse(e.observed_at) + HOURS_MAX_AGE_DAYS * 86_400_000
    || e.coverage_from !== easternDayKey(new Date(e.observed_at))
    || e.coverage_through !== easternDayKey(new Date(e.expires_at))) return undefined;
  if (e.exceptions.some((item) => !item || !isCalendarDate(item.date) || !plain(item.reason, 160)
    || (item.closed !== undefined && item.closed !== true)
    || (item.closed === true) === (item.closes_at !== undefined)
    || (item.closes_at !== undefined && !clock(item.closes_at)))) return undefined;
  // A partial week cannot turn absent weekdays into closed service days.
  for (const day of WEEKDAYS) {
    const periods = hours[day];
    if (!Array.isArray(periods) || periods.length > 2 || periods.some((period) => !period || !clock(period.open) || !clock(period.close) || period.open >= period.close)) return undefined;
  }
  const date = easternDayKey(now);
  const periods = hoursForDate(hours, now);
  if (!periods) return undefined;
  const exception = e.exceptions.find((item) => item.date === date);
  if (exception && !plain(exception.reason, 160)) return undefined;
  const copy = (periods: HoursWindow[]) => periods.map(({ open, close }) => ({ open, close }));
  return {
    label: q.label, scope: q.scope, note: q.note, usage: "display_only",
    source_url: e.source_url, observed_at: e.observed_at, expires_at: e.expires_at,
    posted_weekly: Object.fromEntries(WEEKDAYS.map((day) => [day, copy(hours[day]!)])) as Record<DayOfWeek, HoursWindow[]>,
    today: { date, periods: copy(periods), ...(exception ? { exception_reason: exception.reason } : {}) },
  };
}
