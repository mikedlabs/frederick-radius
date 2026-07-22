import { hasObservationForAlert, isElevatedAirQualityPeriodActive, summarizeAirQualityAlert } from "@/lib/air-quality";
import { prioritizeAlerts } from "@/lib/alert-priority";

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
  /** Pollutants present in the fresh AirNow response. A current ozone value
   * does not cover PM2.5 when an official smoke alert is active. */
  airQualityParameters?: string[];
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

/**
 * line  — the full read with its advice clause, for NowIntel and any
 *         surface with room to counsel.
 * brief — the same read as ONE short observation for the hero headline,
 *         where the greeting already spends words (owner report,
 *         2026-07-19: the weather card carried too much text). Safety
 *         facts stay; directives live in `line`.
 */
export type Verdict = { line: string; brief: string; tone: VerdictTone };

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
    activeAlerts: unsortedActiveAlerts = [],
    airQuality = null,
    airQualityParameters = [],
    alertsAvailable = true,
    airQualityAvailable = true,
    weatherAvailable = true,
  } = input;
  const activeAlerts = prioritizeAlerts(unsortedActiveAlerts);
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
  const airAlertSummary = airAlert ? summarizeAirQualityAlert(airAlert) : null;
  const declaredAirLevel = airAlertSummary?.level ?? null;
  const measuredAqi = airQuality && Number.isFinite(airQuality.aqi) ? airQuality.aqi : null;
  // When a bulletin covers several periods, its operative "issued Code X"
  // declaration wins. Only use broad severity words as a fallback when no
  // declared code can be parsed.
  const hazardousAirAlert = declaredAirLevel === "maroon"
    || (declaredAirLevel === null && /hazardous/i.test(airCopy));
  const veryUnhealthyAirAlert = declaredAirLevel === "purple"
    || (declaredAirLevel === null && /very unhealthy/i.test(airCopy));
  const unhealthyAirAlert = declaredAirLevel === "red"
    || (declaredAirLevel === null && /\bunhealthy\b.*general population/i.test(airCopy));
  const sensitiveAirAlert = Boolean(airAlert);
  const missingAlertPollutant = Boolean(
    airAlertSummary?.pollutant
    && !hasObservationForAlert(airAlertSummary, airQualityParameters),
  );
  const elevatedAirPeriodActive = isElevatedAirQualityPeriodActive(airAlertSummary, now);
  const hazardousAirMeasured = measuredAqi !== null && measuredAqi >= 301;
  const veryUnhealthyAirMeasured = measuredAqi !== null && measuredAqi >= 201;
  const unhealthyAirMeasured = measuredAqi !== null && measuredAqi >= 151;
  const sensitiveAirMeasured = measuredAqi !== null && measuredAqi >= 101;
  const hazardousAir = hazardousAirAlert || hazardousAirMeasured;
  const veryUnhealthyAir = veryUnhealthyAirAlert || veryUnhealthyAirMeasured;
  const unhealthyAir = unhealthyAirAlert || unhealthyAirMeasured;
  const sensitiveAir = sensitiveAirAlert || sensitiveAirMeasured;

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
      line: `${immediateAlert.event} is active, so check official conditions before heading out.`,
      brief: `${immediateAlert.event} is active.`,
      tone: "rough",
    };
  }
  if (heatAlert && (hazardousAir || veryUnhealthyAir || unhealthyAir || sensitiveAir)) {
    return {
      line: "Dangerous heat and unhealthy air are present today. Limit your time and exertion outside.",
      brief: "It is dangerously hot with unhealthy air.",
      tone: "rough",
    };
  }
  if (hazardousAir) {
    return {
      line: hazardousAirMeasured
        ? "The current air is hazardous. Avoid outdoor activity and follow official guidance."
        : "An official air-quality alert warns of hazardous conditions today. Avoid outdoor activity and follow official guidance.",
      brief: hazardousAirMeasured
        ? "The air is hazardous right now."
        : "An alert warns of hazardous air today.",
      tone: "rough",
    };
  }
  if (veryUnhealthyAir) {
    return {
      line: veryUnhealthyAirMeasured
        ? "The current air is very unhealthy. Avoid strenuous activity outside."
        : "An official air-quality alert warns of very unhealthy conditions today. Avoid strenuous activity outside.",
      brief: veryUnhealthyAirMeasured
        ? "The air is very unhealthy right now."
        : "An alert warns of very unhealthy air today.",
      tone: "rough",
    };
  }
  if (unhealthyAir) {
    return {
      line: unhealthyAirMeasured
        ? "The current air is unhealthy. Avoid prolonged or heavy activity outside."
        : "An official air-quality alert warns of unhealthy conditions today. Avoid prolonged or heavy activity outside.",
      brief: unhealthyAirMeasured
        ? "The air is unhealthy right now."
        : "An alert warns of unhealthy air today.",
      tone: "rough",
    };
  }
  if (sensitiveAir) {
    if (!sensitiveAirMeasured && airAlertSummary?.level === "orange" && missingAlertPollutant) {
      const period = airAlertSummary.forecastPeriod ? ` for ${airAlertSummary.forecastPeriod}` : "";
      if (elevatedAirPeriodActive && airAlertSummary.elevatedPeriod) {
        const coverage = airQualityParameters.length > 0
          ? "AirNow’s latest observations do not include PM2.5"
          : "no fresh PM2.5 reading is available";
        return {
          line: `A Code Orange air-quality alert is in effect${period}. The MDE notice says PM2.5 may be unhealthy to very unhealthy ${airAlertSummary.elevatedPeriod}, and ${coverage}, so everyone should avoid strenuous outdoor activity during that window.`,
      brief: "A Code Orange air-quality alert is in effect.",
          tone: "rough",
        };
      }
      const observationCoverage = airQualityParameters.length > 0
        ? "The latest AirNow observations do not include PM2.5 and cannot measure the smoke in the alert."
        : "AirNow has not returned a fresh PM2.5 reading for Frederick, so the current smoke level cannot be confirmed from a live observation.";
      return {
        line: `A Code Orange air-quality alert is in effect${period}. ${observationCoverage}`,
      brief: "A Code Orange air-quality alert is in effect.",
        tone: "rough",
      };
    }
    return {
      line: sensitiveAirMeasured
        ? "The current air is unhealthy for sensitive groups. Reduce strenuous activity outside."
        : airAlertSummary?.levelLabel
          ? `An official Code ${airAlertSummary.levelLabel} air-quality alert warns of unhealthy conditions for sensitive groups. Reduce strenuous activity outside.`
          : "An official air-quality alert warns of unhealthy conditions for sensitive groups. Reduce strenuous activity outside.",
      brief: "The air is rough on sensitive groups today.",
      tone: "rough",
    };
  }
  if (heatAlert) {
    return {
      line: "Dangerous heat is expected today. Limit your time outside and stay hydrated.",
      brief: "Dangerous heat is expected today.",
      tone: "rough",
    };
  }
  const severeAlert = activeAlerts.find(
    (a) => a.severity === "Severe" || a.severity === "Extreme" || /\bwarning\b/i.test(a.event),
  );
  if (severeAlert) {
    return {
      line: `${severeAlert.event} is active, so check official conditions before heading out.`,
      brief: `${severeAlert.event} is active.`,
      tone: "rough",
    };
  }
  if (activeAlerts.length > 0) {
    return {
      line: `${activeAlerts[0].event} is active, so check official conditions before heading out.`,
      brief: `${activeAlerts[0].event} is active.`,
      tone: "mixed",
    };
  }
  if (typeof forecastHigh === "number" && forecastHigh >= 100) {
    return {
      line: "Dangerous heat is expected later today. Limit your time outside and stay hydrated.",
      brief: "Dangerous heat arrives later today.",
      tone: "rough",
    };
  }
  if (typeof forecastHigh === "number" && forecastHigh >= 95) {
    return {
      line: "It will be very hot later today. Plan around shade or air conditioning.",
      brief: "It will be very hot later today.",
      tone: "mixed",
    };
  }

  // 1. Storms, the loudest read, always wins — current hour first, then
  //    the same six-hour window rule 4 uses for rain timing. A "Clear"
  //    current hour with thunderstorms at 8 PM must not read as a patio
  //    evening.
  if (STORM.test(shortForecast)) {
    return { line: "Storms are nearby, so stay close to shelter.", brief: "Storms are close by.", tone: "rough" };
  }
  const stormHorizon = now.getTime() + 6 * 3_600_000;
  const stormHour = hourly.find((h) => {
    const t = Date.parse(h.startTime);
    return Number.isFinite(t) && t > now.getTime() && t <= stormHorizon && STORM.test(h.shortForecast);
  });
  if (stormHour) {
    return {
      line: `Storms are possible by ${hourLabel(stormHour.startTime)}, so stay close to shelter.`,
      brief: `Storms are possible by ${hourLabel(stormHour.startTime)}.`,
      tone: "rough",
    };
  }

  // 2. Snow.
  if (SNOW.test(shortForecast)) {
    return { line: "Snow is falling, and roads may be slow. An indoor plan is safer.", brief: "Snow is falling.", tone: "mixed" };
  }

  // 3. Actively wet now (rain in the forecast + a real chance).
  if (isActivelyWet(shortForecast, precipNow)) {
    return {
      line: overnight
        ? "Rain is moving through tonight."
        : evening
          ? "It is a wet evening, so choose somewhere indoors."
          : "It is wet outside, so an indoor plan makes sense.",
      brief: overnight
        ? "Rain is moving through tonight."
        : evening
          ? "It is a wet evening."
          : "It is wet outside.",
      tone: "rough",
    };
  }

  // Once immediate hazards/current precipitation have been handled, stop
  // before any action-positive planning copy. A forecast that says showers
  // later cannot authorize "get out before then" while either safety feed is
  // unavailable or stale.
  if (!alertsAvailable || !airQualityAvailable || !weatherAvailable) {
    return {
      line: "Current weather or air-safety data is temporarily unavailable. Check official conditions before heading out.",
      brief: "Weather data is temporarily unavailable.",
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
      line: `It is dry now, but showers are expected by ${hourLabel(rainHour.startTime)}. Plan to be inside before then.`,
      brief: `Showers are expected by ${hourLabel(rainHour.startTime)}.`,
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
        ? "A stray shower is possible overnight."
        : evening
          ? "A stray shower is possible, so bring a light layer."
          : "A stray shower is possible, but it should not cancel your day.",
      brief: overnight
        ? "A stray shower is possible overnight."
        : evening
          ? "A stray shower is possible this evening."
          : "A stray shower is possible.",
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
    return { line: "Fog is hanging around, and visibility may be low.", brief: "Fog is hanging around.", tone: "mixed" };
  }

  // 5. Temperature extremes.
  if (temp <= 38) {
    return { line: "It is cold outside, so bundle up before you leave.", brief: "It is cold outside.", tone: "mixed" };
  }
  if (temp >= 89) {
    return { line: "It is hot outside, so look for shade or air conditioning.", brief: "It is hot outside.", tone: "mixed" };
  }

  // 6. The good days. Time-of-day framing turns a generic "nice out"
  //    into a plan.
  const clear = /sunny|clear|fair/i.test(shortForecast);
  const cloudy = /cloud|overcast/i.test(shortForecast);
  if (clear) {
    return {
      line: overnight
        ? "Conditions are quiet and clear tonight."
        : evening
          ? "It is clear and mild enough for a patio this evening."
          : "It is clear and comfortable outside.",
      brief: overnight
        ? "It is quiet and clear tonight."
        : evening
          ? "It is a clear, mild evening."
          : "It is clear and comfortable.",
      tone: "good",
    };
  }
  if (cloudy) {
    return {
      line: overnight
        ? "Clouds are hanging over the county tonight."
        : evening
          ? "It is mild and cloudy this evening."
          : "It is cloudy and comfortable outside.",
      brief: overnight
        ? "Clouds hang over the county tonight."
        : evening
          ? "It is mild and cloudy this evening."
          : "It is cloudy and comfortable.",
      tone: "good",
    };
  }

  // 7. Fallback, honest and calm. Overnight never claims a "day" — at
  //    4 AM the honest read is a quiet night, not daylight.
  return {
    line: overnight
      ? "Conditions are quiet tonight."
      : evening
        ? "Conditions are comfortable this evening."
        : "Conditions are comfortable for heading out.",
      brief: overnight
      ? "It is quiet tonight."
      : evening
        ? "It is a comfortable evening."
        : "It is comfortable out there.",
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
