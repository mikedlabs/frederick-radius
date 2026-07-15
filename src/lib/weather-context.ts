import type { NwsHourly } from "@/lib/integrations/nws";

/** Rainy-day suggestions belong on Today only when rain is current or likely
 * in the next few hours. A vague low-probability \"chance\" does not qualify. */
export function rainyDayIsRelevant(hourly: NwsHourly[]): boolean {
  return hourly.slice(0, 6).some((period, index) => {
    const precip = period.probabilityOfPrecipitation ?? 0;
    const wetWords = /\b(rain|shower|drizzle|thunder|storm|sleet)\b/i.test(period.shortForecast);
    return precip >= 50 || (wetWords && (index === 0 || precip >= 30));
  });
}
