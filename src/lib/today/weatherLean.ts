import type { NwsForecast } from "@/lib/integrations/nws";

/**
 * Weather-conditional composition for /today: the page already KNOWS the
 * forecast — this turns it into a one-word lean the layout can answer.
 *
 *   "wet" — storms/rain own the sky: indoor picks lead, and the golden-hour
 *           beat sits down (there is no golden hour in a thunderstorm).
 *   "hot" — 92°F and up: cool-down picks (ice cream) join the shelf.
 *   null  — an ordinary day; the page composes as usual.
 *
 * Pure + unit-tested; the page derives it from the cached NWS forecast.
 */

export type WeatherLean = "wet" | "hot" | null;

const WET_RE = /thunder|storm|rain|shower|drizzle|snow|sleet|ice\b/i;

export function weatherLean(
  shortForecast: string | null | undefined,
  tempF: number | null | undefined,
  precipChance?: number | null,
): WeatherLean {
  if (shortForecast && WET_RE.test(shortForecast)) return "wet";
  if (typeof precipChance === "number" && precipChance >= 60) return "wet";
  if (typeof tempF === "number" && tempF >= 92) return "hot";
  return null;
}

/** The lean for the hour we're in: the hourly period covering `now`, falling
 *  back to the first hourly period. Null forecast (feed down) → null lean —
 *  a data failure must never masquerade as a weather read. */
export function leanFromForecast(forecast: NwsForecast | null, now: Date): WeatherLean {
  if (!forecast || forecast.hourly.length === 0) return null;
  const t = now.getTime();
  const period =
    forecast.hourly.find((p) => {
      const start = Date.parse(p.startTime);
      const end = Date.parse(p.endTime);
      return Number.isFinite(start) && Number.isFinite(end) && start <= t && t < end;
    }) ?? forecast.hourly[0];
  const temp = period.temperatureUnit === "C" ? (period.temperature * 9) / 5 + 32 : period.temperature;
  return weatherLean(period.shortForecast, temp, period.probabilityOfPrecipitation ?? null);
}
