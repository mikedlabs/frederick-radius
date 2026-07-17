/**
 * Weather verdict, turns a forecast into advice.
 *
 * The WeatherHero already reports the numbers (temp, wind, precip,
 * 7-day). What it lacked is the one thing this app exists for: what
 * the weather MEANS for going out tonight. This module produces a
 * single honest sentence, "Clear and mild, a patio evening" /
 * "Showers by 7, get out before then" / "Storms around, stay close
 * to cover."
 *
 * Pure + deterministic, no network, no clock of its own (now is
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
  /** Forecast daytime high, °F. A mild current hour must not hide a
   *  dangerous afternoon high (the 85° now / 102° high audit failure). */
  forecastHigh?: number | null;
  /** Active NWS alerts for Frederick County. Any real alert suppresses
   *  outdoor-positive copy; heat / severe alerts get the strongest read. */
  activeAlerts?: Array<{
    event: string;
    severity?: "Minor" | "Moderate" | "Severe" | "Extreme" | "Unknown";
    headline?: string;
    description?: string;
  }>;
  /** Worst current AirNow observation when available. AQI 101+ must suppress
   *  outdoor-positive language even before an alert product is published. */
  airQuality?: { aqi: number; category?: string } | null;
  /** Whether the official NWS alert feed answered successfully. `false` is
   *  different from an available feed with zero alerts. */
  alertsAvailable?: boolean;
  /** Whether a fresh AirNow observation was available. Empty, failed, or
   * stale AQI data must not authorize outdoor-positive language. */
  airQualityAvailable?: boolean;
  /** Whether current/hourly forecast data was available. Safety products can
   * still lead when it is false, but ordinary weather cannot be inferred. */
  weatherAvailable?: boolean;
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
const HEAT_ALERT = /\b(heat|heat index)\b/i;
const AIR_ALERT = /\b(air quality|smoke|ozone)\b/i;

/** Minimum current-hour precipitation probability to call it "actively wet".
 *  NWS uses 50%+ for "likely"; below that is "chance"/"slight chance" and a
 *  forecast string like "Scattered Rain Showers" must NOT claim it's raining. */
const WET_NOW_THRESHOLD = 50;

/**
 * True when it is ACTUALLY wet right now: the current-hour forecast mentions
 * rain AND precipitation is at least likely (>=50%). The shortForecast text
 * alone over-claims — "Chance/Scattered Rain Showers" at 30% is dry on the
 * ground. Shared so every "duck inside / rain's in play" surface stays honest.
 * Storms are intentionally NOT gated here (callers warn on them regardless).
 */
export function isActivelyWet(shortForecast: string, precipNow: number | null | undefined): boolean {
  return WET.test(shortForecast) && typeof precipNow === "number" && precipNow >= WET_NOW_THRESHOLD;
}

/**
 * True when the current-hour forecast TEXT mentions rain at all (rain,
 * showers, drizzle) — regardless of probability. This is the exact signal
 * the sky glyph keys on (iconForShortForecast → CloudRain), so any surface
 * that pairs words with the glyph can gate on this and the two never
 * contradict each other (a rain cloud over "Patio weather."). Use the
 * stricter isActivelyWet to decide how WET to call it; use this to decide
 * whether rain is in the picture at all.
 */
export function mentionsWet(shortForecast: string): boolean {
  return WET.test(shortForecast);
}

/**
 * Build the verdict. Checks the dangerous conditions first so a
 * cheerful line can never paper over a storm.
 */
export function weatherVerdict(input: VerdictInput): Verdict {
  const {
    temp,
    shortForecast,
    precipNow,
    hourly,
    now,
    forecastHigh,
    activeAlerts = [],
    airQuality = null,
    alertsAvailable = true,
    airQualityAvailable = true,
    weatherAvailable = true,
  } = input;
  const hour = easternHour(now);
  // Three time frames, so the words match the clock: overnight (22–05,
  // it is DARK — never claim a "day"), evening (17–22), else daytime.
  // The old `hour < 4` evening tail made 4 AM a "fine day to get out";
  // the overnight band owns the dark hours now.
  const overnight = hour >= 22 || hour < 5;
  const evening = hour >= 17 && hour < 22;

  // 0. Safety overrides. These run before every descriptive / cheerful
  // branch: a clear current hour is not "a good day to be outside" when an
  // active alert or a dangerous forecast high says otherwise.
  const heatAlert = activeAlerts.find((a) => HEAT_ALERT.test(`${a.event} ${a.headline ?? ""}`));
  const airAlert = activeAlerts.find((a) => AIR_ALERT.test(`${a.event} ${a.headline ?? ""} ${a.description ?? ""}`));
  const airCopy = `${airAlert?.event ?? ""} ${airAlert?.headline ?? ""} ${airAlert?.description ?? ""}`;
  const measuredAqi = airQuality && Number.isFinite(airQuality.aqi) ? airQuality.aqi : null;
  const hazardousAir = /code\s*maroon|hazardous/i.test(airCopy)
    || (measuredAqi !== null && measuredAqi >= 301);
  const veryUnhealthyAir = /code\s*purple|very unhealthy/i.test(airCopy)
    || (measuredAqi !== null && measuredAqi >= 201);
  const unhealthyAir = /code\s*red|\bunhealthy\b.*general population/i.test(airCopy)
    || (measuredAqi !== null && measuredAqi >= 151);
  const sensitiveAir = Boolean(airAlert)
    || /code\s*orange|sensitive groups/i.test(airCopy)
    || (measuredAqi !== null && measuredAqi >= 101);

  // Immediate/severe non-air hazards lead lower-severity air products. A Code
  // Orange notice must never hide a Tornado or Flash Flood Warning simply
  // because the air branch happens to run first.
  const immediateAlert = activeAlerts.find((a) => {
    const copy = `${a.event} ${a.headline ?? ""} ${a.description ?? ""}`;
    return !AIR_ALERT.test(copy) && !HEAT_ALERT.test(copy) && (
      a.severity === "Extreme" ||
      a.severity === "Severe" ||
      /\b(tornado|severe thunderstorm|flash flood|hurricane|tropical storm|blizzard|ice storm|extreme wind|snow squall).*\bwarning\b|\bwarning\b/i.test(copy)
    );
  });
  if (immediateAlert) {
    return {
      line: `${immediateAlert.event} active, check conditions before heading out.`,
      tone: "rough",
    };
  }
  if (heatAlert && (hazardousAir || veryUnhealthyAir || unhealthyAir || sensitiveAir)) {
    return {
      line: "Dangerous heat and unhealthy air today, limit time and exertion outside.",
      tone: "rough",
    };
  }
  if (hazardousAir) {
    return {
      line: "Hazardous air today, avoid outdoor activity and follow official guidance.",
      tone: "rough",
    };
  }
  if (veryUnhealthyAir) {
    return {
      line: "Very unhealthy air today, avoid strenuous activity outside.",
      tone: "rough",
    };
  }
  if (unhealthyAir) {
    return {
      line: "Unhealthy air today, avoid prolonged or heavy activity outside.",
      tone: "rough",
    };
  }
  if (sensitiveAir) {
    return {
      line: "Air is unhealthy for sensitive groups, take it easier outside.",
      tone: "rough",
    };
  }
  if (heatAlert) {
    return {
      line: "Dangerous heat today, limit time outside and stay hydrated.",
      tone: "rough",
    };
  }
  const severeAlert = activeAlerts.find(
    (a) => a.severity === "Severe" || a.severity === "Extreme" || /\bwarning\b/i.test(a.event),
  );
  if (severeAlert) {
    return {
      line: `${severeAlert.event} active, check conditions before heading out.`,
      tone: "rough",
    };
  }
  if (activeAlerts.length > 0) {
    return {
      line: `${activeAlerts[0].event} active, check conditions before heading out.`,
      tone: "mixed",
    };
  }
  if (typeof forecastHigh === "number" && forecastHigh >= 100) {
    return {
      line: "Dangerous heat later today, limit time outside and stay hydrated.",
      tone: "rough",
    };
  }
  if (typeof forecastHigh === "number" && forecastHigh >= 95) {
    return {
      line: "Very hot later today, plan around shade and AC.",
      tone: "mixed",
    };
  }

  // 1. Storms, the loudest read, always wins — current hour first, then
  //    the same six-hour window rule 4 uses for rain timing. A "Clear"
  //    current hour with thunderstorms at 8 PM must not read as a patio
  //    evening.
  if (STORM.test(shortForecast)) {
    return { line: "Storms around, stay close to cover.", tone: "rough" };
  }
  const stormHorizon = now.getTime() + 6 * 3_600_000;
  const stormHour = hourly.find((h) => {
    const t = Date.parse(h.startTime);
    return Number.isFinite(t) && t > now.getTime() && t <= stormHorizon && STORM.test(h.shortForecast);
  });
  if (stormHour) {
    return {
      line: `Storms around by ${hourLabel(stormHour.startTime)}, stay close to cover.`,
      tone: "rough",
    };
  }

  // 2. Snow.
  if (SNOW.test(shortForecast)) {
    return { line: "Snow out, slow roads, warm rooms.", tone: "mixed" };
  }

  // 3. Actively wet now (rain in the forecast + a real chance).
  if (isActivelyWet(shortForecast, precipNow)) {
    return {
      line: overnight
        ? "Rain moving through the night."
        : evening
          ? "Wet evening, pick somewhere with a roof."
          : "Wet out, an indoor kind of day.",
      tone: "rough",
    };
  }

  // Once immediate hazards/current precipitation have been handled, stop
  // before any action-positive planning copy. A forecast that says showers
  // later cannot authorize "get out before then" while either safety feed is
  // unavailable or stale.
  if (!alertsAvailable || !airQualityAvailable || !weatherAvailable) {
    return {
      line: "Live weather or air-safety data is temporarily unavailable; check conditions before heading out.",
      tone: "mixed",
    };
  }

  // 4. Dry now, but rain is coming, find the first hour in the next
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
      line: `Dry now, showers by ${hourLabel(rainHour.startTime)}, so get out before then.`,
      tone: "mixed",
    };
  }

  // 4.5. Rain in the TEXT but below the actively-wet bar ("Scattered
  //      Rain Showers" at 30%): the sky glyph keys on the text
  //      (mentionsWet), so a cheerful line here would contradict the
  //      rain cloud beside it. Neutral, honest, not alarmed.
  if (mentionsWet(shortForecast)) {
    return {
      line: overnight
        ? "A stray shower possible out there."
        : evening
          ? "A stray shower possible, worth a light layer."
          : "A stray shower possible, nothing to cancel over.",
      tone: "mixed",
    };
  }

  // 4.7. Fog/mist/haze — the branch this module was missing. TodayCard's
  //      own moodLine had it ("Low and gray."), so the hero and NowIntel
  //      read the same sky in OPPOSITE moods within one viewport (the
  //      4:18 AM audit render: "Low and gray." over "A fine day to get
  //      out."). One engine owns the read now; fog can never fall
  //      through to a fine-day line again.
  if (/fog|mist|haz[ey]/i.test(shortForecast)) {
    return { line: "Low and gray, fog hanging around.", tone: "mixed" };
  }

  // 5. Temperature extremes.
  if (temp <= 38) {
    return { line: "Cold one, bundle up if you head out.", tone: "mixed" };
  }
  if (temp >= 89) {
    return { line: "Hot out, chase shade and AC.", tone: "mixed" };
  }

  // 6. The good days. Time-of-day framing turns a generic "nice out"
  //    into a plan.
  const clear = /sunny|clear|fair/i.test(shortForecast);
  const cloudy = /cloud|overcast/i.test(shortForecast);
  if (clear) {
    return {
      line: overnight
        ? "Quiet and clear out there."
        : evening
          ? "Clear and easy, a patio kind of evening."
          : "Clear out, a good day to be outside.",
      tone: "good",
    };
  }
  if (cloudy) {
    return {
      line: overnight
        ? "Quiet night, clouds over the county."
        : evening
          ? "Mild and grey, a comfortable evening to wander."
          : "Soft and grey, an easy day to explore.",
      tone: "good",
    };
  }

  // 7. Fallback, honest and calm. Overnight never claims a "day" — at
  //    4 AM the honest read is a quiet night, not daylight.
  return {
    line: overnight
      ? "A quiet night out there."
      : evening
        ? "A fine evening to get out."
        : "A fine day to get out.",
    tone: "good",
  };
}

/**
 * nextWeatherChange, Mercury Weather's editorial-second-line move.
 *
 * The verdict is the mood ("Storms around, stay close to cover.").
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
 * (rare but possible, a flat shoulder day with no precip).
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

  // First "clearing" event, currently wet/cloudy, dries out.
  if (WET.test(cur.shortForecast) || /cloud|overcast/i.test(cur.shortForecast)) {
    const clear = horizon.find((h) => /sunny|clear|fair/i.test(h.shortForecast));
    if (clear) {
      return `Clearing after ${compactHour(clear.startTime)}`;
    }
  }

  // First significant temp swing, ≥5°F off the current hour.
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

  // Nothing meaningful in 12h, name it as a calm shoulder.
  const hour = easternHour(now);
  if (hour >= 17 || hour < 4) return "Steady through evening";
  return "Steady through the day";
}
