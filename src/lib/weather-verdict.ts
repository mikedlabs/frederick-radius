/**
 * Weather verdict — turns a forecast into advice.
 *
 * The WeatherHero already reports the numbers (temp, wind, precip,
 * 7-day). What it lacked is the one thing this app exists for: what
 * the weather MEANS for going out tonight. This module produces a
 * single honest sentence — "Clear and mild, a patio evening" /
 * "Showers by 7, get out before then" / "Storms around, stay close
 * to cover."
 *
 * Pure + deterministic — no network, no clock of its own (now is
 * passed in). Ordered so a dangerous read (storm, active rain) can
 * never be overwritten by a cheerful one.
 */

export type VerdictTone = "good" | "mixed" | "rough";

export type VerdictInput = {
  /** Current hour temperature, °F. */
  temp: number;
  /** Current hour NWS shortForecast string. */
  shortForecast: string;
  /** Current hour precipitation probability, 0–100. */
  precipNow: number;
  /** Upcoming hours (already time-sorted), for precip-timing. */
  hourly: Array<{
    startTime: string;
    probabilityOfPrecipitation?: number;
    shortForecast: string;
  }>;
  now: Date;
};

export type Verdict = { line: string; tone: VerdictTone };

/** Eastern-time hour 0–23 for the time-of-day framing. */
function easternHour(d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(d),
    10,
  ) % 24;
}

/** "7 PM"-style label for a precip-start time. */
function hourLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
  }).format(new Date(iso));
}

const STORM = /thunder|t-?storm|severe/i;
const SNOW = /snow|sleet|flurr|wintry|ice/i;
const WET = /\b(rain|showers?|drizzle)\b/i;

/**
 * Build the verdict. Checks the dangerous conditions first so a
 * cheerful line can never paper over a storm.
 */
export function weatherVerdict(input: VerdictInput): Verdict {
  const { temp, shortForecast, precipNow, hourly, now } = input;
  const hour = easternHour(now);
  const evening = hour >= 17 || hour < 4;

  // 1. Storms — the loudest read, always wins.
  if (STORM.test(shortForecast)) {
    return { line: "Storms around — stay close to cover.", tone: "rough" };
  }

  // 2. Snow.
  if (SNOW.test(shortForecast)) {
    return { line: "Snow out — slow roads, warm rooms.", tone: "mixed" };
  }

  // 3. Actively wet now (rain in the forecast + a real chance).
  if (WET.test(shortForecast) && precipNow >= 50) {
    return {
      line: evening
        ? "Wet evening — pick somewhere with a roof."
        : "Wet out — an indoor kind of day.",
      tone: "rough",
    };
  }

  // 4. Dry now, but rain is coming — find the first hour in the next
  //    six that crosses a real chance, and name the time.
  const horizon = now.getTime() + 6 * 3_600_000;
  const rainHour = hourly.find((h) => {
    const t = Date.parse(h.startTime);
    return (
      Number.isFinite(t) &&
      t > now.getTime() &&
      t <= horizon &&
      (h.probabilityOfPrecipitation ?? 0) >= 50 &&
      WET.test(h.shortForecast)
    );
  });
  if (rainHour) {
    return {
      line: `Dry now — showers by ${hourLabel(rainHour.startTime)}, so get out before then.`,
      tone: "mixed",
    };
  }

  // 5. Temperature extremes.
  if (temp <= 38) {
    return { line: "Cold one — bundle up if you head out.", tone: "mixed" };
  }
  if (temp >= 89) {
    return { line: "Hot out — chase shade and AC.", tone: "mixed" };
  }

  // 6. The good days. Time-of-day framing turns a generic "nice out"
  //    into a plan.
  const clear = /sunny|clear|fair/i.test(shortForecast);
  const cloudy = /cloud|overcast/i.test(shortForecast);
  if (clear) {
    return {
      line: evening
        ? "Clear and easy — a patio kind of evening."
        : "Clear out — a good day to be outside.",
      tone: "good",
    };
  }
  if (cloudy) {
    return {
      line: evening
        ? "Mild and grey — a comfortable evening to wander."
        : "Soft and grey — an easy day to explore.",
      tone: "good",
    };
  }

  // 7. Fallback — honest and calm.
  return {
    line: evening ? "A fine evening to get out." : "A fine day to get out.",
    tone: "good",
  };
}

/**
 * nextWeatherChange — Mercury Weather's editorial-second-line move.
 *
 * The verdict is the mood ("Storms around — stay close to cover.").
 * This one is the facts: the first thing in the forecast that's
 * actually going to change, named with a specific time. Examples:
 *
 *   "Warming to 80° by 4 PM"
 *   "Cooling to 62° by 9 PM"
 *   "Rain starting at 5 PM"
 *   "Clearing after 6 PM"
 *   "Steady through evening"
 *
 * Returns null when nothing meaningful changes in the next 12 hours
 * (rare but possible — a flat shoulder day with no precip).
 *
 * Computed from the same hourly array the chart uses, so what the
 * user reads matches what they see on the curve.
 */
type ChangeInput = {
  hourly: Array<{
    startTime: string;
    temperature: number;
    probabilityOfPrecipitation?: number;
    shortForecast: string;
  }>;
  now: Date;
};

function compactHour(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
  }).format(new Date(iso));
}

export function nextWeatherChange({ hourly, now }: ChangeInput): string | null {
  if (hourly.length < 2) return null;
  const cur = hourly[0];
  const horizon = hourly.slice(1, 12);

  // First significant precip onset (>=40%) when it isn't already wet.
  if ((cur.probabilityOfPrecipitation ?? 0) < 30) {
    const wet = horizon.find(
      (h) =>
        (h.probabilityOfPrecipitation ?? 0) >= 40 &&
        WET.test(h.shortForecast),
    );
    if (wet) {
      return `Rain starting around ${compactHour(wet.startTime)}`;
    }
  }

  // First "clearing" event — currently wet/cloudy, dries out.
  if (WET.test(cur.shortForecast) || /cloud|overcast/i.test(cur.shortForecast)) {
    const clear = horizon.find((h) => /sunny|clear|fair/i.test(h.shortForecast));
    if (clear) {
      return `Clearing after ${compactHour(clear.startTime)}`;
    }
  }

  // First significant temp swing — ≥5°F off the current hour.
  // "Warming to X by hh" / "Cooling to X by hh".
  let extreme: { t: number; iso: string } | null = null;
  for (const h of horizon) {
    if (Math.abs(h.temperature - cur.temperature) < 5) continue;
    if (!extreme || Math.abs(h.temperature - cur.temperature) > Math.abs(extreme.t - cur.temperature)) {
      extreme = { t: h.temperature, iso: h.startTime };
    }
  }
  if (extreme) {
    const verb = extreme.t > cur.temperature ? "Warming" : "Cooling";
    return `${verb} to ${extreme.t}° by ${compactHour(extreme.iso)}`;
  }

  // Nothing meaningful in 12h — name it as a calm shoulder.
  const hour = easternHour(now);
  if (hour >= 17 || hour < 4) return "Steady through evening";
  return "Steady through the day";
}
