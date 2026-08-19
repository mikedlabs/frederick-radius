import type { AskResult, AskSource } from "@/lib/ask/contracts";
import type { NwsForecast, NwsHourly } from "@/lib/integrations/nws";
import type { NwsAlert, NwsAlertsResult } from "@/lib/integrations/nws-alerts";
import {
  airQualityObservedAt,
  isFreshAqiObservation,
  pickWorstAqi,
  type AqiObservation,
} from "@/lib/integrations/airnow";
import {
  AIRNOW_FREDERICK_URL,
} from "@/lib/weather-safety";
import { compareAlertPriority } from "@/lib/alert-priority";
import {
  MUNICIPALITIES,
  MUNICIPALITY_BY_SLUG,
  type Municipality,
} from "@/data/municipalities";

const NWS_FREDERICK_FORECAST_URL =
  "https://forecast.weather.gov/MapClick.php?lat=39.4143&lon=-77.4105";
const NWS_FREDERICK_ALERTS_URL = "https://www.weather.gov/lwx/";
const FORECAST_MAX_AGE_MS = 3 * 60 * 60 * 1_000;
const FORECAST_FUTURE_SKEW_MS = 60 * 60 * 1_000;
const PERIOD_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const ALERT_MAX_AGE_MS = 15 * 60 * 1_000;
const ALERT_FUTURE_SKEW_MS = 2 * 60 * 1_000;

const CURRENT_TIME_RE = /\b(?:right now|currently|at the moment|now)\b/i;
const NEGATED_CURRENT_TIME_RE =
  /\b(?:not|isn['’]?t|aren['’]?t)\s+(?:right\s+)?now\b|\bnot\s+at\s+the\s+moment\b/i;
const FUTURE_TIME_RE =
  /\b(?:later|tonight|tomorrow|this (?:morning|afternoon|evening)|after (?:work|school|lunch|dinner)|before (?:work|school|lunch|dinner)|at lunch(?:time)?|in (?:an?|one|two|three|four|five|six|\d+) (?:minutes?|hours?)|at \d{1,2}(?::\d{2})?(?:\s*(?:a\.?m\.?|p\.?m\.?))?)\b/i;
const OUTDOOR_CONTEXT_RE =
  /\b(?:outside|outdoors?|outdoor conditions?|spend(?:ing)? time outside|be outside|sit(?:ting)? outside|walk(?:ing)?|weather|temperature|air quality|aqi)\b/i;
const CONDITIONS_JUDGMENT_RE =
  /\b(?:safe|comfort(?:able|ably)|okay|ok|nice|pleasant|feel(?:ing)?|good time|good idea|conditions?|weather|temperature|air quality|aqi|should (?:i|we)|can (?:i|we)|what(?:'s| is) it like|how (?:hot|cold|humid|muggy|windy|rainy)|too (?:hot|cold|humid|muggy|windy|rainy))\b/i;
const DISCOVERY_REQUEST_RE =
  /\b(?:find|recommend|suggest|events?|concerts?|festivals?|restaurants?|cafes?|breweries?|places? to go|things? to do|what(?:'s| is) happening)\b/i;
const DESTINATION_NAVIGATION_RE =
  /\b(?:walk(?:ing)?|bike|biking|drive|driving|get)\s+(?:me\s+|us\s+)?to\b|\b(?:how far|how long)\b/i;

const UNRESOLVED_FREDERICK_COMMUNITIES = [
  "adamstown",
  "ballenger creek",
  "bartonsville",
  "braddock heights",
  "buckeystown",
  "clover hill",
  "ijamsville",
  "jefferson",
  "knoxville",
  "lake linganore",
  "lewistown",
  "libertytown",
  "linganore",
  "monrovia",
  "point of rocks",
  "sabillasville",
  "spring ridge",
  "tuscarora",
  "wolfsville",
  "yellow springs",
] as const;

export type CurrentOutdoorConditionsSnapshot = {
  forecast: NwsForecast | null;
  alerts: NwsAlertsResult;
  airObservations: AqiObservation[] | null;
};

export type CurrentOutdoorConditionsOptions = {
  areaLabel?: string;
  now?: Date;
  point?: { lat: number; lng: number };
};

/**
 * Direct condition questions are status lookups, not discovery prompts.
 * Keep this narrow so “find an outdoor concert tonight” still reaches the
 * event engine while “is it comfortable outside right now?” never can.
 */
export function wantsCurrentOutdoorConditions(query: string): boolean {
  return CURRENT_TIME_RE.test(query)
    && !NEGATED_CURRENT_TIME_RE.test(query)
    && !FUTURE_TIME_RE.test(query)
    && OUTDOOR_CONTEXT_RE.test(query)
    && CONDITIONS_JUDGMENT_RE.test(query)
    && !DISCOVERY_REQUEST_RE.test(query)
    && !DESTINATION_NAVIGATION_RE.test(query);
}

function phrasePattern(value: string): RegExp {
  const escaped = value
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

/** Resolve a destination named in a direct live-conditions question.
 * A named town outranks the phone or saved browsing scope. Bare “Frederick”
 * remains county/city ambiguous; only “Frederick City” or “downtown
 * Frederick” selects the city centroid. */
export function currentOutdoorMunicipality(
  query: string,
): Municipality | null {
  for (const municipality of MUNICIPALITIES) {
    if (municipality.slug === "frederick") continue;
    const names = new Set([
      municipality.name,
      municipality.slug.replace(/-/g, " "),
    ]);
    if ([...names].some((name) => phrasePattern(name).test(query))) {
      return municipality;
    }
  }
  if (
    /\bfrederick\s+city\b/i.test(query) ||
    /\bdowntown\s+frederick\b/i.test(query)
  ) {
    return MUNICIPALITY_BY_SLUG.frederick;
  }
  return null;
}

export type CurrentOutdoorAreaReference =
  | { kind: "municipality"; municipality: Municipality }
  | { kind: "county" }
  | { kind: "unresolved"; label: string; ambiguousFrederick?: boolean }
  | null;

function cleanAreaCandidate(value: string): string {
  return value
    .replace(/^(?:the\s+)?(?:area\s+(?:of|around)\s+)?/i, "")
    .replace(/[?.!,;:]+$/g, "")
    .trim()
    .slice(0, 80);
}

function displayAreaLabel(value: string): string {
  return value
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\b(?:Of|The)\b/g, (word) => word.toLowerCase());
}

function beforeCurrentPhrase(query: string): string {
  const currentMatch = CURRENT_TIME_RE.exec(query);
  return (currentMatch ? query.slice(0, currentMatch.index) : query)
    .replace(/[?.!,;:]+$/g, "")
    .trim();
}

function currentAreaClause(query: string): string | null {
  const beforeCurrent = beforeCurrentPhrase(query);
  const match = /\b(?:in|around|near)\s+(.+?)$/i.exec(beforeCurrent);
  return match ? cleanAreaCandidate(match[1]) : null;
}

function isContextOnlyArea(value: string): boolean {
  return /^(?:me|here|home|my (?:area|location)|where (?:i am|we are)|area|this area|town|downtown|outside|(?:a )?(?:park|trail|yard|patio)|this (?:weather|heat|cold|rain)|weather|heat|cold|rain|sun|shade|general)$/i.test(
    value,
  );
}

/** Resolve only location names for which Radius has a reviewed weather point.
 * An explicit but unsupported area is returned as unresolved so the route can
 * ask for clarification instead of quietly substituting the phone or county
 * center. */
export function currentOutdoorAreaReference(
  query: string,
): CurrentOutdoorAreaReference {
  const municipality = currentOutdoorMunicipality(query);
  if (municipality) return { kind: "municipality", municipality };
  if (/\bfrederick\s+county\b/i.test(query)) return { kind: "county" };

  const areaClause = currentAreaClause(query);
  if (areaClause) {
    if (/^(?:frederick\s+)?county$/i.test(areaClause)) {
      return { kind: "county" };
    }
    if (/^(?:downtown\s+)?frederick$/i.test(areaClause)) {
      return {
        kind: "unresolved",
        label: "Frederick",
        ambiguousFrederick: true,
      };
    }
    if (/^downtown$/i.test(areaClause)) {
      return { kind: "municipality", municipality: MUNICIPALITY_BY_SLUG.frederick };
    }
    const namedCommunity = UNRESOLVED_FREDERICK_COMMUNITIES.find((name) =>
      phrasePattern(name).test(areaClause)
    );
    if (namedCommunity) {
      return { kind: "unresolved", label: displayAreaLabel(namedCommunity) };
    }
    if (!isContextOnlyArea(areaClause)) {
      return {
        kind: "unresolved",
        label: areaClause.replace(/^downtown\s+/i, ""),
      };
    }
  }

  const downtownMatch = /\bdowntown(?:\s+(.+?))?$/i.exec(beforeCurrentPhrase(query));
  if (downtownMatch?.[1]) {
    return { kind: "unresolved", label: cleanAreaCandidate(downtownMatch[1]) };
  }
  if (downtownMatch) {
    return { kind: "municipality", municipality: MUNICIPALITY_BY_SLUG.frederick };
  }
  return null;
}

export function currentOutdoorLocationClarification(
  reference: Extract<CurrentOutdoorAreaReference, { kind: "unresolved" }>,
): AskResult {
  const answer = reference.ambiguousFrederick
    ? "Do you mean Frederick City or Frederick County? Name one so I check the right conditions."
    : `I can’t place “${reference.label}” precisely enough for a local conditions answer yet. Ask about Frederick County, choose a Radius town, or share your location.`;
  return {
    status: "empty",
    configured: true,
    usedModel: false,
    answer,
    sources: [],
    intelligence: {
      tools: ["weather", "location"],
      confidence: "medium",
      retrieval: "keyword",
    },
  };
}

function formatEasternTime(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isFreshForecast(forecast: NwsForecast | null, now: Date): boolean {
  if (!forecast) return false;
  const asOf = validDate(forecast.asOf);
  if (!asOf) return false;
  const age = now.getTime() - asOf.getTime();
  return age >= -FORECAST_FUTURE_SKEW_MS && age <= FORECAST_MAX_AGE_MS;
}

function currentForecastPeriod(
  forecast: NwsForecast | null,
  now: Date,
): NwsHourly | null {
  if (!isFreshForecast(forecast, now)) return null;
  const nowMs = now.getTime();
  return forecast?.hourly.find((period) => {
    const startsAt = Date.parse(period.startTime);
    const endsAt = Date.parse(period.endTime);
    return Number.isFinite(startsAt)
      && Number.isFinite(endsAt)
      && startsAt <= nowMs + PERIOD_FUTURE_SKEW_MS
      && endsAt > nowMs;
  }) ?? null;
}

function activeAlerts(alerts: readonly NwsAlert[], now: Date): NwsAlert[] {
  const nowMs = now.getTime();
  return alerts.filter((alert) => {
    const startsAt = Date.parse(alert.starts_at);
    const endsAt = Date.parse(alert.ends_at);
    return (!Number.isFinite(startsAt) || startsAt <= nowMs)
      && (!Number.isFinite(endsAt) || endsAt > nowMs);
  });
}

function urgencyRank(alert: NwsAlert): number {
  return {
    Immediate: 5,
    Expected: 4,
    Future: 3,
    Unknown: 2,
    Past: 1,
  }[alert.urgency];
}

function compareCurrentAlertPriority(left: NwsAlert, right: NwsAlert): number {
  return compareAlertPriority(left, right)
    || urgencyRank(right) - urgencyRank(left)
    || Date.parse(right.starts_at) - Date.parse(left.starts_at);
}

function alertCheckedAt(result: NwsAlertsResult): Date | null {
  return result.checkedAt ? validDate(result.checkedAt) : null;
}

function isFreshAlertResult(result: NwsAlertsResult, now: Date): boolean {
  if (!result.available) return false;
  const checkedAt = alertCheckedAt(result);
  if (!checkedAt) return false;
  const age = now.getTime() - checkedAt.getTime();
  return age >= -ALERT_FUTURE_SKEW_MS && age <= ALERT_MAX_AGE_MS;
}

function formatTemperature(period: NwsHourly): string {
  return `${period.temperature}°${period.temperatureUnit}`;
}

function temperatureFahrenheit(period: NwsHourly): number {
  return period.temperatureUnit === "C"
    ? (period.temperature * 9) / 5 + 32
    : period.temperature;
}

function relativeHumidity(period: NwsHourly): number | null {
  const value = period.relativeHumidity;
  return Number.isFinite(value) && value != null
    ? Math.max(0, Math.min(100, value))
    : null;
}

function dewpointFahrenheit(period: NwsHourly): number | null {
  return Number.isFinite(period.dewpointC) && period.dewpointC != null
    ? (period.dewpointC * 9) / 5 + 32
    : null;
}

/** NOAA's heat-index regression is only meaningful in warm, humid weather.
 * It is used as a conservative comfort signal, not displayed as an observed
 * temperature or presented as medical guidance. */
function heatIndexFahrenheit(period: NwsHourly): number | null {
  const temperature = temperatureFahrenheit(period);
  const humidity = relativeHumidity(period);
  if (humidity === null || temperature < 80 || humidity < 40) return null;

  const simple = 0.5 * (
    temperature +
    61 +
    (temperature - 68) * 1.2 +
    humidity * 0.094
  );
  if ((simple + temperature) / 2 < 80) return simple;

  let heatIndex =
    -42.379 +
    2.04901523 * temperature +
    10.14333127 * humidity -
    0.22475541 * temperature * humidity -
    0.00683783 * temperature * temperature -
    0.05481717 * humidity * humidity +
    0.00122874 * temperature * temperature * humidity +
    0.00085282 * temperature * humidity * humidity -
    0.00000199 * temperature * temperature * humidity * humidity;

  if (humidity < 13 && temperature >= 80 && temperature <= 112) {
    heatIndex -= ((13 - humidity) / 4) * Math.sqrt(
      Math.max(0, (17 - Math.abs(temperature - 95)) / 17),
    );
  } else if (humidity > 85 && temperature >= 80 && temperature <= 87) {
    heatIndex += ((humidity - 85) / 10) * ((87 - temperature) / 5);
  }
  return heatIndex;
}

function moistureClause(period: NwsHourly): string {
  const temperature = temperatureFahrenheit(period);
  if (temperature < 75) return "";
  const humidity = relativeHumidity(period);
  if (humidity !== null && humidity >= 65) {
    return `, with relative humidity near ${Math.round(humidity)}%`;
  }
  const dewpoint = dewpointFahrenheit(period);
  return dewpoint !== null && dewpoint >= 65
    ? `, with a dew point near ${Math.round(dewpoint)}°F`
    : "";
}

function moistureReason(period: NwsHourly): string {
  const temperature = temperatureFahrenheit(period);
  if (temperature < 75) return "";
  const humidity = relativeHumidity(period);
  if (humidity !== null && humidity >= 65) {
    return ` · ${Math.round(humidity)}% relative humidity`;
  }
  const dewpoint = dewpointFahrenheit(period);
  return dewpoint !== null && dewpoint >= 65
    ? ` · Dew point ${Math.round(dewpoint)}°F`
    : "";
}

function forecastClause(period: NwsHourly): string {
  return `the National Weather Service forecasts ${formatTemperature(period)} and ${period.shortForecast.toLowerCase()}${moistureClause(period)}`;
}

function airClause(observation: AqiObservation): string {
  return `AirNow reports AQI ${observation.aqi} (${observation.category.name}) for ${observation.reportingArea}`;
}

function formatAlertWindow(alert: NwsAlert): string {
  const expiry = validDate(alert.ends_at);
  return expiry ? ` until ${formatEasternTime(expiry)}` : "";
}

function englishList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "live conditions";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function areaPhrase(areaLabel: string): string {
  return /^near you$/i.test(areaLabel) ? "near you" : `in ${areaLabel}`;
}

function sourceSlugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "weather";
}

function comfortRead(period: NwsHourly): "comfortable" | "uncomfortable" | "mixed" {
  const fahrenheit = temperatureFahrenheit(period);
  const humidity = relativeHumidity(period);
  const dewpoint = dewpointFahrenheit(period);
  const heatIndex = heatIndexFahrenheit(period);
  const wetOrStormy = /\b(?:thunder|storm|rain|shower|drizzle|snow|sleet|ice)\b/i.test(
    period.shortForecast,
  );
  const rainLikely = (period.probabilityOfPrecipitation ?? 0) >= 50;
  const wind = Number.parseInt(period.windSpeed, 10);
  const oppressiveHumidity = fahrenheit >= 80 && (dewpoint ?? -Infinity) >= 75;
  if (
    fahrenheit >= 90 ||
    fahrenheit <= 32 ||
    (heatIndex ?? -Infinity) >= 90 ||
    oppressiveHumidity ||
    wetOrStormy && rainLikely ||
    wind >= 30
  ) {
    return "uncomfortable";
  }
  const humidWarmth = fahrenheit >= 78 && (
    (humidity ?? -Infinity) >= 70 ||
    (dewpoint ?? -Infinity) >= 67 ||
    (heatIndex ?? -Infinity) >= 84
  );
  if (fahrenheit >= 84 || fahrenheit <= 45 || humidWarmth || wetOrStormy) {
    return "mixed";
  }
  return "comfortable";
}

function unavailableSource(
  slug: string,
  name: string,
  href: string,
  reason: string,
  checkedAt: Date,
): AskSource {
  return {
    slug,
    name,
    category: "weather",
    city: "Frederick County",
    href,
    eyebrow: "Official conditions",
    reason,
    status: `Checked ${formatEasternTime(checkedAt)}`,
    confidence: "medium",
  };
}

function forecastSource(
  forecast: NwsForecast | null,
  period: NwsHourly | null,
  now: Date,
  href: string,
  areaLabel: string,
): AskSource {
  const asOf = forecast ? validDate(forecast.asOf) : null;
  if (!period || !asOf) {
    return unavailableSource(
      "nws-current-forecast-unavailable",
      "Current weather not verified",
      href,
      forecast ? "The hourly forecast is not current" : "Hourly forecast unavailable",
      now,
    );
  }
  return {
    slug: "nws-current-forecast",
    name: "Current weather",
    category: "weather",
    city: areaLabel === "near you" ? "Frederick County" : areaLabel,
    href,
    eyebrow: "National Weather Service · Hourly forecast",
    reason: `${formatTemperature(period)} · ${period.shortForecast}${moistureReason(period)}`,
    status: `Updated ${formatEasternTime(asOf)}`,
    confidence: "high",
  };
}

function alertSources(
  result: NwsAlertsResult,
  alerts: NwsAlert[],
  now: Date,
  feedFresh: boolean,
): AskSource[] {
  const checkedAt = alertCheckedAt(result);
  if (alerts.length > 0) {
    return alerts.map((alert) => ({
      slug: `nws-alert-${sourceSlugPart(alert.id)}`,
      name: alert.event,
      category: "weather",
      city: "Frederick County",
      href: alert.url,
      eyebrow: "National Weather Service · Active alert",
      reason: alert.headline,
      status: `Active${formatAlertWindow(alert)}${checkedAt ? ` · Feed checked ${formatEasternTime(checkedAt)}` : " · Feed time unavailable"}`,
      confidence: feedFresh ? "high" : "medium",
    }));
  }
  if (!feedFresh) {
    const reason = !result.available
      ? "Official alert feed unavailable"
      : !checkedAt
        ? "Official alert feed time unavailable"
        : `Official alert feed last checked ${formatEasternTime(checkedAt)}`;
    return [{
      slug: "nws-alerts-unavailable",
      name: "Weather alerts not verified",
      category: "weather",
      city: "Frederick County",
      href: NWS_FREDERICK_ALERTS_URL,
      eyebrow: "Official conditions",
      reason,
      status: checkedAt
        ? `Last response ${formatEasternTime(checkedAt)}`
        : `Attempted ${formatEasternTime(now)}`,
      confidence: "medium",
    }];
  }
  return [{
    slug: "nws-alert-status",
    name: "NWS alerts · none active",
    category: "weather",
    city: "Frederick County",
    href: NWS_FREDERICK_ALERTS_URL,
    eyebrow: "National Weather Service · Active alerts",
    reason: "No active Frederick County alert returned",
    status: `Checked ${formatEasternTime(checkedAt ?? now)}`,
    confidence: "high",
  }];
}

function airSource(
  observations: AqiObservation[] | null,
  observation: AqiObservation | null,
  now: Date,
): AskSource {
  const observedAt = observation ? airQualityObservedAt(observation) : null;
  if (!observation || !observedAt) {
    return unavailableSource(
      "airnow-current-aqi-unavailable",
      "Air quality not verified",
      AIRNOW_FREDERICK_URL,
      observations === null
        ? "AirNow observation unavailable"
        : "No fresh AirNow observation returned",
      now,
    );
  }
  return {
    slug: "airnow-current-aqi",
    name: `Air quality · AQI ${observation.aqi}`,
    category: "weather",
    city: observation.reportingArea,
    href: AIRNOW_FREDERICK_URL,
    eyebrow: "AirNow · Current observation",
    reason: observation.category.name,
    status: `Observed ${formatEasternTime(observedAt)}`,
    confidence: "high",
  };
}

/**
 * A short, deterministic answer for a current outdoor-conditions question.
 * “No alerts” is only stated after a fresh, timestamped NWS response, and
 * reassuring comfort language is only allowed when all live inputs are current.
 */
export function currentOutdoorConditionsAskResult(
  snapshot: CurrentOutdoorConditionsSnapshot,
  {
    areaLabel = "Frederick County",
    now = new Date(),
    point,
  }: CurrentOutdoorConditionsOptions = {},
): AskResult {
  const forecastHref = point
    ? `https://forecast.weather.gov/MapClick.php?lat=${point.lat.toFixed(4)}&lon=${point.lng.toFixed(4)}`
    : NWS_FREDERICK_FORECAST_URL;
  const period = currentForecastPeriod(snapshot.forecast, now);
  const freshAir = (snapshot.airObservations ?? []).filter((observation) =>
    isFreshAqiObservation(observation, now)
  );
  const worstAir = pickWorstAqi(freshAir);
  const alertFeedFresh = isFreshAlertResult(snapshot.alerts, now);
  const currentAlerts = activeAlerts(snapshot.alerts.alerts, now)
    .sort(compareCurrentAlertPriority);
  const leadAlert = currentAlerts[0] ?? null;
  const missing = [
    !period ? "a current hourly forecast" : null,
    !alertFeedFresh ? "a current official alert feed" : null,
    !worstAir ? "a fresh AirNow reading" : null,
  ].filter((value): value is string => value !== null);

  const facts: string[] = [];
  if (period) facts.push(forecastClause(period));
  if (worstAir) facts.push(airClause(worstAir));
  if (alertFeedFresh && currentAlerts.length === 0) {
    facts.push("the official NWS alert feed reports no active Frederick County alert");
  }

  let answer: string;
  if (leadAlert) {
    const otherAlertCount = currentAlerts.length - 1;
    answer = `Use caution outdoors ${areaPhrase(areaLabel)} right now. The National Weather Service has a ${leadAlert.event} active for Frederick County${formatAlertWindow(leadAlert)}`;
    if (otherAlertCount > 0) {
      answer += `, with ${otherAlertCount} other active ${otherAlertCount === 1 ? "alert" : "alerts"}`;
    }
    answer += ".";
    const readingFacts = [
      period ? forecastClause(period) : null,
      worstAir ? airClause(worstAir) : null,
    ].filter((value): value is string => value !== null);
    if (readingFacts.length > 0) {
      answer += ` Current readings: ${englishList(readingFacts)}.`;
    }
    if (missing.length > 0) {
      answer += ` I couldn’t verify ${englishList(missing)}.`;
    }
    answer += " Open the official alert before heading out.";
  } else if (missing.length > 0) {
    answer = `I can’t give an all-clear for spending time outdoors ${areaPhrase(areaLabel)} right now because I couldn’t verify ${englishList(missing)}.`;
    if (facts.length > 0) answer += ` I could confirm that ${englishList(facts)}.`;
    answer += " Check Pulse or the official sources before heading out.";
  } else if (worstAir && worstAir.category.id >= 4) {
    const unhealthyAirFacts = [
      airClause(worstAir),
      period ? forecastClause(period) : null,
      alertFeedFresh && currentAlerts.length === 0
        ? "the official NWS alert feed reports no active Frederick County alert"
        : null,
    ].filter((value): value is string => value !== null);
    answer = `Outdoor conditions ${areaPhrase(areaLabel)} are poor right now: ${englishList(unhealthyAirFacts)}.`;
    answer += " Follow AirNow guidance before spending time outside.";
  } else if (worstAir && worstAir.category.id === 3) {
    answer = `People in sensitive groups should use extra caution outdoors ${areaPhrase(areaLabel)} right now: ${englishList(facts)}.`;
    answer += " Follow AirNow guidance before spending time outside.";
  } else {
    const comfort = period ? comfortRead(period) : "mixed";
    const comfortLine = comfort === "comfortable"
      ? "Those conditions may feel comfortable for many people"
      : comfort === "uncomfortable"
        ? "Those conditions may feel uncomfortable for many people"
        : "Comfort will vary with those conditions";
    answer = `Right now ${areaPhrase(areaLabel)}, ${englishList(facts)}. ${comfortLine}, but this is not a personal safety guarantee.`;
  }

  const sources = [
    ...alertSources(snapshot.alerts, currentAlerts, now, alertFeedFresh),
    forecastSource(snapshot.forecast, period, now, forecastHref, areaLabel),
    airSource(snapshot.airObservations, worstAir, now),
  ];
  const primaryAction = leadAlert
    ? { label: "Open official alert", kind: "open" as const, href: leadAlert.url }
    : worstAir && worstAir.category.id >= 3
      ? { label: "Open AirNow details", kind: "open" as const, href: AIRNOW_FREDERICK_URL }
      : { label: "Open live conditions", kind: "open" as const, href: "/pulse" };

  return {
    status: "answered",
    configured: true,
    usedModel: false,
    answer,
    sources,
    actions: [
      primaryAction,
      { label: "Open hourly forecast", kind: "open", href: forecastHref },
    ],
    intelligence: {
      tools: ["weather", "air-quality", "alerts"],
      confidence: missing.length === 0 ? "high" : "medium",
      retrieval: "keyword",
    },
  };
}
