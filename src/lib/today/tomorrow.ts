/**
 * Tomorrow helpers: the forward answer a late-night visitor gets instead of a
 * spent day.
 *
 * Everything here keys off the Eastern clock and the one daypart module, so
 * the beat never leaks into the daytime: WHEN to show it (the late daypart,
 * 21:00 to 04:59), WHICH day is coming (the Eastern calendar day, not now
 * plus 24 hours), WHAT is still on tonight, WHICH of the coming day's
 * listings may be shown, and WHAT the coming day's weather looks like. Pure
 * and deterministic; the page composes the rows.
 */
import { DAY_START_HOUR, daypart } from "@/lib/daypart";
import { isUtilityEvent } from "@/lib/event-kind";
import { compareForLead, type LeadRankable } from "@/lib/events/lead-rank";
import { eventDecisionVerification } from "@/lib/events/decision-verification";
import { isEventEnded } from "@/lib/eventWhenLabel";
import type { SourceConfidence } from "@/lib/provenance";
import { easternDayKey, easternParts, easternWallToUtcISO } from "@/lib/tz";
import type { NwsForecast, NwsHourly } from "@/lib/integrations/nws";

/**
 * Show the coming-day rows once it is the "late" daypart (21:00 to 04:59
 * Eastern) and never during the day. Strict: at 8:59 PM it is false.
 */
export function isTomorrowPreviewTime(now: Date): boolean {
  return daypart(now) === "late";
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type ComingDay = {
  /** Eastern calendar day key, "YYYY-MM-DD". */
  key: string;
  weekday: (typeof WEEKDAYS)[number];
  /** "Tomorrow, Thursday", or "Later today, Wednesday" after midnight. */
  heading: string;
  /** True between midnight and 5 AM, when the coming day is today's date. */
  laterToday: boolean;
  /** The instant the coming day begins for people (5 AM Eastern). */
  startsAtMs: number;
};

/**
 * The day a person means by "tomorrow" right now, on the Eastern calendar.
 *
 * From 5 AM to midnight it is the next calendar day. Between midnight and
 * 5 AM the calendar has already turned, so the coming day is today's date:
 * at 1 AM Wednesday it is Wednesday ("Later today, Wednesday"), not Thursday,
 * which is what the old now-plus-24-hours arithmetic produced. Calendar
 * arithmetic also stays right across the DST changes, when a day is 23 or
 * 25 hours long.
 */
export function comingDay(now: Date): ComingDay {
  const p = easternParts(now);
  const laterToday = p.hour < DAY_START_HOUR;
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day + (laterToday ? 0 : 1)));
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const weekday = WEEKDAYS[date.getUTCDay()];
  return {
    key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    weekday,
    heading: laterToday ? `Later today, ${weekday}` : `Tomorrow, ${weekday}`,
    laterToday,
    startsAtMs: easternWallHourMs(year, month, day, DAY_START_HOUR),
  };
}

const HOUR_MS = 3_600_000;

/** An Eastern wall-clock hour as an instant. easternWallToUtcISO reads the
 * offset at a probe instant, which lands before the 2 AM switch on a DST-change
 * day and so is an hour off for 5 AM; one corrective step fixes that. */
function easternWallHourMs(year: number, month: number, day: number, hour: number): number {
  const ms = Date.parse(easternWallToUtcISO(year, month, day, hour, 0));
  const actual = easternParts(new Date(ms)).hour;
  return actual === hour ? ms : ms + (hour - actual) * HOUR_MS;
}

type TimedListing = {
  starts_at: string;
  ends_at?: string | null;
  is_all_day?: boolean;
};

/**
 * In the late daypart, Today's own program narrows to what a person could
 * still go to tonight: a clock-time listing that is live, still ahead, or
 * inside the short grace the shared timing rules give a listing with no
 * posted end, and that starts before the coming day begins. All-day rows
 * drop out because a festival's daytime hours are over by 9 PM, and rows
 * that already wrapped up are not shown at all after 9 PM. Pass `day` when
 * filtering a whole feed so the calendar math runs once.
 */
export function isStillOnTonight(
  event: TimedListing,
  now: Date,
  day: ComingDay = comingDay(now),
): boolean {
  if (event.is_all_day) return false;
  const start = Date.parse(event.starts_at);
  if (!Number.isFinite(start)) return false;
  if (start >= day.startsAtMs) return false;
  return !isEventEnded(event, now);
}

export type ComingDayCandidate = LeadRankable &
  TimedListing & {
    slug?: string;
    status?: string | null;
    source_url?: string | null;
    confidence: SourceConfidence;
    last_verified_at?: string | null;
  };

/** The coming day's program on Today stays this short. */
export const COMING_DAY_ROW_LIMIT = 3;

/**
 * Up to three of the coming day's listings, under the same gate Today's own
 * program uses for its draws: not a utility row, and verified at its
 * publisher recently enough to support a decision (eventDecisionVerification).
 * The strongest listings are chosen by lead rank, then shown in time order so
 * the time column reads down the day.
 */
export function selectComingDayEvents<T extends ComingDayCandidate>(
  events: readonly T[],
  now: Date,
  limit: number = COMING_DAY_ROW_LIMIT,
): T[] {
  const day = comingDay(now);
  return events
    .filter((event) => {
      const start = Date.parse(event.starts_at);
      if (!Number.isFinite(start)) return false;
      if (easternDayKey(new Date(start)) !== day.key) return false;
      if (!event.is_all_day && start < day.startsAtMs) return false;
      if (event.status === "cancelled" || event.status === "postponed") return false;
      if (isUtilityEvent(event)) return false;
      return eventDecisionVerification(event, now).sourceVerified;
    })
    .sort((a, b) => compareForLead(a, b))
    .slice(0, Math.max(0, limit))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/**
 * The coming day's daytime forecast: the first DAILY period marked isDaytime
 * whose Eastern calendar day is the coming day. Returns null when the
 * forecast is missing or doesn't reach that day, so the caller omits the
 * weather sentence rather than guess a number. Temperature and condition come
 * straight off the NWS daily period.
 */
export function tomorrowDaytimeForecast(
  forecast: NwsForecast | null,
  now: Date,
): { temp: number; shortForecast: string } | null {
  if (!forecast?.daily?.length) return null;
  const { key } = comingDay(now);
  const period: NwsHourly | undefined = forecast.daily.find(
    (p) => p.isDaytime === true && easternDayKey(new Date(p.startTime)) === key,
  );
  if (!period || typeof period.temperature !== "number") return null;
  return { temp: period.temperature, shortForecast: period.shortForecast ?? "" };
}

/**
 * The one NWS sentence under the coming-day heading, e.g. "The forecast high
 * is 64°, with mostly sunny skies." Worded for both "Tomorrow" and "Later
 * today", and null when the forecast cannot support it.
 */
export function comingDayWeatherSentence(
  forecast: NwsForecast | null,
  now: Date,
): string | null {
  const wx = tomorrowDaytimeForecast(forecast, now);
  if (!wx) return null;
  const condition = wx.shortForecast ? shortCondition(wx.shortForecast) : "";
  return `The forecast high is ${wx.temp}°${condition ? `, with ${condition}` : ""}.`;
}

/** A concise, honest read of a verbose NWS daily condition ("Chance Showers
 *  And Thunderstorms Then Showers Likely" becomes "storms possible"), so the
 *  sentence stays one calm clause. Falls back to a lowercased first phrase. */
export function shortCondition(sf: string): string {
  const t = sf.toLowerCase();
  if (/thunder|t-?storm|severe/.test(t)) return "storms possible";
  if (/snow|sleet|flurr|wintry|ice/.test(t)) return "wintry weather possible";
  if (/rain|shower|drizzle/.test(t)) return "rain possible";
  if (/fog|mist|haz/.test(t)) return "fog or haze";
  if (/overcast|mostly cloudy/.test(t)) return "mostly cloudy skies";
  if (/partly (sunny|cloudy)/.test(t)) return "partly sunny skies";
  if (/cloud/.test(t)) return "some clouds";
  if (/sunny/.test(t)) return "mostly sunny skies";
  if (/clear|fair/.test(t)) return "clear skies";
  // Unknown phrasing: first clause before a "then", lowercased.
  return t.split(/\s+then\s+/)[0].trim();
}
