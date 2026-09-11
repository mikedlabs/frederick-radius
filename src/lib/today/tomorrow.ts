/**
 * Tomorrow-preview helpers — the quiet forward answer a late-night visitor gets
 * instead of a spent day.
 *
 * Two decisions, both keyed off the Eastern clock so the beat never leaks into
 * the daytime: WHEN to show the preview (past ~9 PM, through the small hours),
 * and WHAT tomorrow's weather looks like (the next day's daytime high from the
 * NWS daily periods). Pure + deterministic — the clock gate is unit-tested and
 * the weather lookup is a plain array find.
 */
import { daypart } from "@/lib/daypart";
import { easternDayKey } from "@/lib/tz";
import type { NwsForecast, NwsHourly } from "@/lib/integrations/nws";

/**
 * Show the Tomorrow preview once it's the "late" daypart (21:00–05:00 Eastern)
 * and never during the day. Reuses the daypart spine so the events board and
 * this beat agree on when "late" begins. Strict: at 8:59 PM it's false.
 */
export function isTomorrowPreviewTime(now: Date): boolean {
  return daypart(now) === "late";
}

/**
 * Tomorrow's daytime forecast — the first DAILY period marked isDaytime whose
 * Eastern calendar day is the day after `now`. Returns null when the forecast is
 * missing or doesn't reach tomorrow (so the caller omits the weather clause
 * rather than guess a number). Nothing here is fabricated: temp + condition come
 * straight off the NWS daily period.
 */
export function tomorrowDaytimeForecast(
  forecast: NwsForecast | null,
  now: Date,
): { temp: number; shortForecast: string } | null {
  if (!forecast?.daily?.length) return null;
  const tomorrowKey = easternDayKey(new Date(now.getTime() + 24 * 3_600_000));
  const period: NwsHourly | undefined = forecast.daily.find(
    (p) => p.isDaytime === true && easternDayKey(new Date(p.startTime)) === tomorrowKey,
  );
  if (!period || typeof period.temperature !== "number") return null;
  return { temp: period.temperature, shortForecast: period.shortForecast ?? "" };
}
