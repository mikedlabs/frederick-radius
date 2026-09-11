/**
 * Shared air-quality semantics.
 *
 * NWS/MDE bulletins often describe more than one time period. The official
 * alert level is the level MDE says it "has issued" near the start of the
 * product, not necessarily the worst color mentioned later in background or
 * timing text. AirNow observations are also pollutant-specific: an O3 value
 * cannot stand in for a missing PM2.5 reading during a smoke event.
 */

export type AirQualityLevel = "green" | "yellow" | "orange" | "red" | "purple" | "maroon";

export type AirQualityAlertSummary = {
  level: AirQualityLevel | null;
  levelLabel: string | null;
  forecastPeriod: string | null;
  pollutant: "pm25" | "ozone" | null;
  elevatedRange: "Red-to-Purple" | null;
  elevatedPeriod: string | null;
  improvementPeriod: string | null;
};

type AlertLike = {
  event?: string;
  headline?: string;
  description?: string;
};

const LEVEL = "(maroon|purple|red|orange|yellow|green)";
const DAY = "(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
const AIR_PRODUCT = /\b(air quality|smoke|ozone|fine particulate|pm\s*2\.?5|particle pollution)\b/i;

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function normalizedCopy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Return the level that the issuing agency explicitly declared. */
function declaredLevel(copy: string): AirQualityLevel | null {
  // Prefer the operative declaration. This avoids treating explanatory text
  // such as "Red to Purple Friday night" as the level of a Code Orange product
  // issued for Saturday.
  const operative = new RegExp(
    `\\b(?:issued|declared|continued|continues|remains|in effect)\\b[^.!?]{0,180}?\\bcode\\s*${LEVEL}\\b`,
    "i",
  ).exec(copy);
  if (operative) return operative[1].toLowerCase() as AirQualityLevel;

  // Some products put the color directly in the event/headline without an
  // issuing verb. Use the first explicit "Code X Air Quality Alert" phrase,
  // rather than searching the whole body once per severity from worst down.
  const direct = new RegExp(`\\bcode\\s*${LEVEL}\\s+air quality alert\\b`, "i").exec(copy);
  return direct ? direct[1].toLowerCase() as AirQualityLevel : null;
}

function declaredForecastPeriod(copy: string): string | null {
  const match = new RegExp(`\\bair quality alert\\s+${DAY}\\b`, "i").exec(copy);
  return match ? titleCase(match[1]) : null;
}

function smokeRiskPeriod(copy: string): string | null {
  const match = new RegExp(
    `\\b(${DAY}(?:\\s+(?:morning|afternoon|evening|night))?\\s+(?:into|through|until)\\s+${DAY}?(?:\\s+)?(?:morning|afternoon|evening|night))\\b`,
    "i",
  ).exec(copy);
  if (!match) return null;
  return match[1]
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\s+/g, " ");
}

function improvementPeriod(copy: string): string | null {
  const match = /\bair quality begins to improve\s+([^.!?]+)/i.exec(copy);
  if (!match) return null;
  return match[1]
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

export function summarizeAirQualityAlert(alert: AlertLike): AirQualityAlertSummary | null {
  const copy = normalizedCopy(`${alert.event ?? ""} ${alert.headline ?? ""} ${alert.description ?? ""}`);
  if (!AIR_PRODUCT.test(copy)) return null;

  const level = declaredLevel(copy);
  const smokeRelated = /\b(smoke|fine particulate|pm\s*2\.?5|particle pollution)\b/i.test(copy);
  const ozoneRelated = /\bozone\b/i.test(copy);
  const redPurpleTiming = /\bunhealthy\s*\(red alert\)\s+to\s+very unhealthy\s*\(purple alert\)/i.test(copy)
    || /\bred(?:\s+alert)?\b[^.!?]{0,100}\bpurple(?:\s+alert)?\b/i.test(copy);

  return {
    level,
    levelLabel: level ? titleCase(level) : null,
    forecastPeriod: declaredForecastPeriod(copy),
    pollutant: smokeRelated ? "pm25" : ozoneRelated ? "ozone" : null,
    elevatedRange: redPurpleTiming ? "Red-to-Purple" : null,
    elevatedPeriod: redPurpleTiming ? smokeRiskPeriod(copy) : null,
    improvementPeriod: improvementPeriod(copy),
  };
}

export function aqiParameterLabel(parameter: string): string {
  const normalized = parameter.replace(/\s+/g, "").toUpperCase();
  if (normalized === "O3" || normalized === "OZONE") return "ozone";
  if (normalized === "PM2.5" || normalized === "PM25" || normalized === "PM2_5") return "PM2.5";
  if (normalized === "PM10") return "PM10";
  return parameter.trim() || "pollutant";
}

export function aqiObservationLabel(parameter: string, aqi: number): string {
  const pollutant = aqiParameterLabel(parameter).replace(/^./, (character) => character.toUpperCase());
  return `${pollutant} AQI ${aqi}`;
}

export function isPm25Parameter(parameter: string): boolean {
  return aqiParameterLabel(parameter) === "PM2.5";
}

export function hasObservationForAlert(
  summary: AirQualityAlertSummary | null,
  parameters: string[],
): boolean {
  if (!summary?.pollutant) return parameters.length > 0;
  if (summary.pollutant === "pm25") return parameters.some(isPm25Parameter);
  return parameters.some((parameter) => aqiParameterLabel(parameter) === "ozone");
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const PART_START = { morning: 5, afternoon: 12, evening: 17, night: 20 } as const;
const PART_END = { morning: 12, afternoon: 17, evening: 22, night: 24 } as const;

/**
 * Whether the bulletin's explicitly described elevated window is active in
 * Frederick local time. This lets the UI preserve an issued Code Orange label
 * while using the stronger advice attached to a Red-to-Purple overnight
 * period. Unsupported prose returns false instead of guessing.
 */
export function isElevatedAirQualityPeriodActive(
  summary: AirQualityAlertSummary | null,
  now: Date,
): boolean {
  const period = summary?.elevatedPeriod;
  if (!period) return false;
  const match = /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(morning|afternoon|evening|night)\s+(?:into|through|until)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(morning|afternoon|evening|night)$/i.exec(period);
  if (!match) return false;

  const startDay = WEEKDAYS.indexOf(match[1].toLowerCase() as (typeof WEEKDAYS)[number]);
  const endDay = WEEKDAYS.indexOf(match[3].toLowerCase() as (typeof WEEKDAYS)[number]);
  const startPart = match[2].toLowerCase() as keyof typeof PART_START;
  const endPart = match[4].toLowerCase() as keyof typeof PART_END;
  const eastern = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const currentDayName = eastern.find((part) => part.type === "weekday")?.value.toLowerCase();
  const hourText = eastern.find((part) => part.type === "hour")?.value;
  const currentDay = currentDayName
    ? WEEKDAYS.indexOf(currentDayName as (typeof WEEKDAYS)[number])
    : -1;
  const currentHour = hourText ? Number.parseInt(hourText, 10) % 24 : Number.NaN;
  if (startDay < 0 || endDay < 0 || currentDay < 0 || !Number.isFinite(currentHour)) return false;

  const spanDays = (endDay - startDay + 7) % 7;
  const currentOffset = (currentDay - startDay + 7) % 7;
  if (currentOffset > spanDays) return false;
  if (currentOffset === 0 && currentHour < PART_START[startPart]) return false;
  if (currentOffset === spanDays && currentHour >= PART_END[endPart]) return false;
  return true;
}
