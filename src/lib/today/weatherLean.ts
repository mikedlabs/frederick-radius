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

type HourlyPeriod = NwsForecast["hourly"][number];

function periodLean(period: HourlyPeriod): WeatherLean {
  const temp =
    period.temperatureUnit === "C"
      ? (period.temperature * 9) / 5 + 32
      : period.temperature;
  return weatherLean(
    period.shortForecast,
    temp,
    period.probabilityOfPrecipitation ?? null,
  );
}

/** Index of the hourly period covering `now`, else 0 (the first period). */
function currentPeriodIndex(forecast: NwsForecast, now: Date): number {
  const t = now.getTime();
  const found = forecast.hourly.findIndex((p) => {
    const start = Date.parse(p.startTime);
    const end = Date.parse(p.endTime);
    return Number.isFinite(start) && Number.isFinite(end) && start <= t && t < end;
  });
  return found === -1 ? 0 : found;
}

/** The lean for the hour we're in: the hourly period covering `now`, falling
 *  back to the first hourly period. Null forecast (feed down) → null lean —
 *  a data failure must never masquerade as a weather read. */
export function leanFromForecast(forecast: NwsForecast | null, now: Date): WeatherLean {
  if (!forecast || forecast.hourly.length === 0) return null;
  return periodLean(forecast.hourly[currentPeriodIndex(forecast, now)]);
}

/**
 * When the wet stretch ends, from the same hourly array the lean was read
 * from. Walks forward from the current period to the first one this module no
 * longer calls "wet" and returns its startTime.
 *
 * The page awaited a full hourly forecast to extract one word and threw the
 * rest away, so it could only say storms were "close by" while the hour they
 * clear sat in the array. Returns null when the current hour is not wet, when
 * the feed's window ends while it is still raining (an unknown end is not a
 * forecast), or when the period carries no usable start time.
 */
export function wetWindowEnd(
  forecast: NwsForecast | null,
  now: Date,
): { endsAtLabel: string; noun: string } | null {
  if (!forecast || forecast.hourly.length === 0) return null;
  const start = currentPeriodIndex(forecast, now);
  const current = forecast.hourly[start];
  if (periodLean(current) !== "wet") return null;

  for (let i = start + 1; i < forecast.hourly.length; i += 1) {
    if (periodLean(forecast.hourly[i]) === "wet") continue;
    const parsed = Date.parse(forecast.hourly[i].startTime);
    if (!Number.isFinite(parsed)) return null;
    return {
      endsAtLabel: easternHourLabel(new Date(parsed)),
      noun: wetNoun(current.shortForecast),
    };
  }
  return null;
}

/** "7pm" in Frederick's timezone, matching how the rest of the app writes
 *  a clock hour (lib/hours.ts formatTime), regardless of the device. */
function easternHourLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: true,
  })
    .format(d)
    .replace(/\s?(AM|PM)/, (_, ampm: string) => ampm.toLowerCase());
}

/**
 * What to call the wet weather, taken from the NWS phrase rather than
 * hardcoded. WET_RE also matches drizzle, snow, sleet, and ice, so a fixed
 * "Storms" mislabels four of the six conditions that set the lean.
 */
function wetNoun(shortForecast: string | null | undefined): string {
  const text = shortForecast ?? "";
  if (/thunder|storm/i.test(text)) return "Storms are";
  if (/snow/i.test(text)) return "Snow is";
  if (/sleet|ice\b/i.test(text)) return "Ice is";
  if (/drizzle/i.test(text)) return "Drizzle is";
  return "Rain is";
}
