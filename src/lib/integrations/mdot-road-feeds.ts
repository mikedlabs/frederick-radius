/**
 * Frederick County adapters for the public Maryland CHART road feeds.
 *
 * These types keep the evidence boundary explicit:
 * - speed, travel time, DMS, and RWIS are device observations;
 * - road conditions are maintenance-shop area reports;
 * - a snow emergency is an official county declaration.
 *
 * None of these values is a claim that a particular route is safe.
 */
import { isValidCoord } from "@/lib/geo";

const BASE =
  "https://chartexp1.sha.maryland.gov/CHARTExportClientService";

export const CHART_ROAD_SOURCES = {
  speeds: `${BASE}/getTSSMapDataJSON.do`,
  messages: `${BASE}/getDMSMapDataJSON.do`,
  weatherStations: `${BASE}/getRWISMapDataJSON.do`,
  travelTimes: `${BASE}/getTravelRouteDataJSON.do`,
  roadConditions: `${BASE}/getIPSMapDataJSON.do`,
  snowEmergency: `${BASE}/getSEPMapDataJSON.do`,
} as const;

const FUTURE_SKEW_MS = 5 * 60 * 1_000;

export type ChartFeedResult<T> = {
  data: T[];
  available: boolean;
  /** Latest provider observation, or HTTP response date for a valid empty feed. */
  asOf?: string;
};

export type ChartSpeedSensor = {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  observedAt: string;
  zones: Array<{
    direction?: string;
    bearing?: number;
    speedMph: number;
  }>;
  evidence: "device-observation";
  sourceUrl: typeof CHART_ROAD_SOURCES.speeds;
};

export type ChartTravelTime = {
  id: string;
  name: string;
  distanceMiles: number;
  travelTimeSeconds: number;
  averageSpeedMph: number;
  trend: "longer" | "shorter" | "steady";
  observedAt: string;
  roads: string[];
  evidence: "computed-from-road-sensors";
  sourceUrl: typeof CHART_ROAD_SOURCES.travelTimes;
};

export type ChartHighwayMessage = {
  id: string;
  location: string;
  message: string;
  lat: number;
  lng: number;
  observedAt: string;
  beaconsEnabled: boolean;
  evidence: "device-observation";
  sourceUrl: typeof CHART_ROAD_SOURCES.messages;
};

export type ChartRoadWeatherStation = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  observedAt: string;
  fullRwis: boolean;
  airTemperatureF: number | null;
  dewPointF: number | null;
  pavementTemperatureF: { low: number; high: number } | null;
  precipitationType: string | null;
  relativeHumidityPercent: number | null;
  gustMph: number | null;
  visibilityMiles: number | null;
  wind: string | null;
  scope: "at-station";
  evidence: "device-observation";
  sourceUrl: typeof CHART_ROAD_SOURCES.weatherStations;
};

export type ChartRoadConditionReport = {
  id: string;
  station: string;
  lat: number;
  lng: number;
  observedAt: string;
  conditions: {
    interstate: ChartRoadCondition | null;
    primary: ChartRoadCondition | null;
    secondary: ChartRoadCondition | null;
  };
  scope: "maintenance-shop-area";
  evidence: "official-area-report";
  sourceUrl: typeof CHART_ROAD_SOURCES.roadConditions;
};

export type ChartRoadCondition = {
  description: string;
  /** Provider impact grouping: 0 routine, 1 coverage/isolated, 2 restricted/severe. */
  providerGroup: 0 | 1 | 2;
};

export type ChartSnowEmergency = {
  id: string;
  county: "Frederick County";
  status: "active" | "lifted";
  declaredAt: string;
  liftedAt: string | null;
  exception: string | null;
  evidence: "official-declaration";
  sourceUrl: typeof CHART_ROAD_SOURCES.snowEmergency;
};

type Raw = Record<string, unknown>;
type FetchOptions = {
  deadlineMs?: number;
  now?: Date;
};

function object(value: unknown): Raw | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Raw
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function number(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value: unknown): string | null {
  if (value == null || value === "") return null;
  let date: Date;
  const numeric = number(value);
  if (
    numeric !== null &&
    (typeof value === "number" || /^\d+(?:\.\d+)?$/.test(String(value)))
  ) {
    date = new Date(numeric < 1_000_000_000_000 ? numeric * 1_000 : numeric);
  } else {
    date = new Date(String(value));
  }
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function fresh(value: string, now: Date, maxAgeMs: number): boolean {
  const age = now.getTime() - Date.parse(value);
  return age >= -FUTURE_SKEW_MS && age <= maxAgeMs;
}

function coord(raw: Raw): { lat: number; lng: number } | null {
  const lat = number(raw.lat);
  const lng = number(raw.lon);
  if (lat === null || lng === null || !isValidCoord({ lat, lng })) return null;
  return { lat, lng };
}

function direction(value: unknown): string | undefined {
  const raw = text(value).toLowerCase().replaceAll("_", " ");
  if (!raw || /^(n\/a|none|unknown|other no additional info)$/.test(raw)) {
    return undefined;
  }
  return raw;
}

function route(prefix: unknown, routeNumber: unknown): string | null {
  const p = text(prefix).toUpperCase();
  const n = text(routeNumber).toUpperCase();
  if (!p || !n) return null;
  return p === "I" ? `I-${n}` : `${p} ${n}`;
}

function latest(values: Array<string | null | undefined>): string | undefined {
  const valid = values.filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return valid[0];
}

function responseDate(response: Response): string | undefined {
  return timestamp(response.headers.get("date")) ?? undefined;
}

async function fetchRows(
  url: string,
  { deadlineMs = 5_000 }: FetchOptions,
): Promise<{ rows: unknown[]; responseAsOf?: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "FrederickRadius/1.0 (+https://frederickradius.app)",
      },
      signal: controller.signal,
      // CHART publishes these as public external-app feeds but returns
      // Cache-Control: no-store. Honor that response policy at the upstream
      // boundary. The shared road snapshot may hold the normalized facts for
      // one minute; Radius never creates a durable CHART archive here.
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = object(await response.json().catch(() => null));
    if (!payload || payload.success === false || !Array.isArray(payload.data)) {
      return null;
    }
    return { rows: payload.data, responseAsOf: responseDate(response) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeChartSpeedSensors(
  values: unknown[],
  now = new Date(),
): ChartSpeedSensor[] {
  const out: ChartSpeedSensor[] = [];
  for (const value of values) {
    const raw = object(value);
    if (!raw || text(raw.opStatus).toUpperCase() !== "OK" ||
      text(raw.commMode).toUpperCase() !== "ONLINE") continue;
    const point = coord(raw);
    const observedAt = timestamp(raw.lastUpdateTime);
    if (!point || !observedAt || !fresh(observedAt, now, 15 * 60 * 1_000)) continue;
    const zones = (Array.isArray(raw.zones) ? raw.zones : [])
      .map((value) => object(value))
      .filter((value): value is Raw => Boolean(value))
      .map((zone) => ({
        direction: direction(zone.direction),
        bearing: number(zone.bearing) ?? undefined,
        speedMph: number(zone.speed),
      }))
      .filter((zone): zone is {
        direction: string | undefined;
        bearing: number | undefined;
        speedMph: number;
      } => zone.speedMph !== null && zone.speedMph >= 0 && zone.speedMph <= 100);
    const id = text(raw.id);
    if (!id || zones.length === 0) continue;
    out.push({
      id,
      name: text(raw.name) || "Traffic speed sensor",
      description: text(raw.description) || text(raw.name),
      ...point,
      observedAt,
      zones,
      evidence: "device-observation",
      sourceUrl: CHART_ROAD_SOURCES.speeds,
    });
  }
  return out.sort((a, b) => a.description.localeCompare(b.description));
}

export function normalizeChartTravelTimes(
  values: unknown[],
  now = new Date(),
): ChartTravelTime[] {
  const out: ChartTravelTime[] = [];
  for (const value of values) {
    const raw = object(value);
    if (!raw || text(raw.statsState).toUpperCase() !== "DATA_OK") continue;
    const locations = (Array.isArray(raw.locations) ? raw.locations : [])
      .map((value) => object(value))
      .filter((value): value is Raw => Boolean(value));
    if (!locations.some((item) => /frederick county/i.test(text(item.countyName)))) {
      continue;
    }
    const observedAt = timestamp(raw.updateTime);
    const distanceMiles = number(raw.length);
    const travelTimeSeconds = number(raw.travelTimeSecs);
    const averageSpeedMph = number(raw.speed);
    if (
      !observedAt || !fresh(observedAt, now, 15 * 60 * 1_000) ||
      distanceMiles === null || distanceMiles <= 0 || distanceMiles > 500 ||
      travelTimeSeconds === null || travelTimeSeconds <= 0 || travelTimeSeconds > 86_400 ||
      averageSpeedMph === null || averageSpeedMph < 0 || averageSpeedMph > 100
    ) continue;
    const id = text(raw.id);
    const name = text(raw.name);
    if (!id || !name) continue;
    const rawTrend = text(raw.trend).toUpperCase();
    const trend = rawTrend === "UP" ? "longer" : rawTrend === "DOWN" ? "shorter" : "steady";
    out.push({
      id,
      name,
      distanceMiles,
      travelTimeSeconds,
      averageSpeedMph,
      trend,
      observedAt,
      roads: [...new Set(locations
        .map((item) => route(item.routePrefix, item.routeNumber))
        .filter((item): item is string => Boolean(item)))],
      evidence: "computed-from-road-sensors",
      sourceUrl: CHART_ROAD_SOURCES.travelTimes,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/<br\s*\/?>|<\/(?:td|tr|p)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " · ")
    .replace(/(?:\s*·\s*)+/g, " · ")
    .trim()
    .replace(/^·|·$/g, "")
    .trim();
}

export function cleanChartDmsMessage(raw: Raw): string {
  const plain = text(raw.msgPlain);
  return (plain || decodeHtml(text(raw.msgHTML)))
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeChartHighwayMessages(
  values: unknown[],
  now = new Date(),
): ChartHighwayMessage[] {
  const out: ChartHighwayMessage[] = [];
  for (const value of values) {
    const raw = object(value);
    if (!raw || text(raw.opStatus).toUpperCase() !== "OK" ||
      text(raw.commMode).toUpperCase() !== "ONLINE") continue;
    const point = coord(raw);
    const observedAt = timestamp(raw.lastCachedDataUpdateTime);
    const message = cleanChartDmsMessage(raw);
    const id = text(raw.id);
    if (
      !id || !point || !message || !observedAt ||
      !fresh(observedAt, now, 12 * 60 * 60 * 1_000)
    ) continue;
    out.push({
      id,
      location: text(raw.description) || text(raw.name) || "Highway message sign",
      message,
      ...point,
      observedAt,
      beaconsEnabled: raw.beaconsEnabled === true,
      evidence: "device-observation",
      sourceUrl: CHART_ROAD_SOURCES.messages,
    });
  }
  return out.sort((a, b) => a.location.localeCompare(b.location));
}

function measurement(value: unknown): number | null {
  const raw = text(value);
  if (!raw || /^(no data available|n\/a|none|unknown)$/i.test(raw)) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  return match ? number(match[0]) : null;
}

function temperatureRange(value: unknown): { low: number; high: number } | null {
  const matches = text(value).match(/-?\d+(?:\.\d+)?/g)?.map(Number)
    .filter(Number.isFinite) ?? [];
  if (matches.length === 0) return null;
  return { low: Math.min(...matches), high: Math.max(...matches) };
}

function label(value: unknown): string | null {
  const valueText = text(value);
  if (!valueText || /^no data available$|^n\/a$|^unknown$/i.test(valueText)) return null;
  return valueText.toLowerCase() === "none" ? "none" : valueText;
}

export function normalizeChartRoadWeather(
  values: unknown[],
  now = new Date(),
): ChartRoadWeatherStation[] {
  const out: ChartRoadWeatherStation[] = [];
  for (const value of values) {
    const raw = object(value);
    if (!raw) continue;
    const point = coord(raw);
    const observedAt = timestamp(raw.lastUpdate);
    if (!point || !observedAt || !fresh(observedAt, now, 45 * 60 * 1_000)) continue;
    const row: ChartRoadWeatherStation = {
      id: text(raw.id),
      name: text(raw.description) || text(raw.name),
      ...point,
      observedAt,
      fullRwis: raw.fullRWIS === true,
      airTemperatureF: measurement(raw.airTemp),
      dewPointF: measurement(raw.dewPoint),
      pavementTemperatureF: temperatureRange(raw.pavementTemp),
      precipitationType: label(raw.precipitationType),
      relativeHumidityPercent: measurement(raw.relativeHumidity),
      gustMph: measurement(raw.gustSpeed),
      visibilityMiles: measurement(raw.visibility),
      wind: label(raw.windDescription),
      scope: "at-station",
      evidence: "device-observation",
      sourceUrl: CHART_ROAD_SOURCES.weatherStations,
    };
    if (!row.id || !row.name) continue;
    if (
      row.airTemperatureF === null &&
      row.dewPointF === null &&
      row.pavementTemperatureF === null &&
      row.precipitationType === null &&
      row.relativeHumidityPercent === null &&
      row.gustMph === null &&
      row.visibilityMiles === null &&
      row.wind === null
    ) continue;
    out.push(row);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function condition(value: unknown): ChartRoadCondition | null {
  const raw = object(value);
  const description = text(raw?.description);
  const group = number(raw?.group);
  if (!description || group === null || ![0, 1, 2].includes(group)) return null;
  return { description, providerGroup: group as 0 | 1 | 2 };
}

export function normalizeChartRoadConditions(
  values: unknown[],
  now = new Date(),
): ChartRoadConditionReport[] {
  const out: ChartRoadConditionReport[] = [];
  for (const value of values) {
    const raw = object(value);
    if (!raw || !/frederick/i.test(text(raw.county))) continue;
    const point = coord(raw);
    const observedAt = timestamp(raw.lastUpdate);
    if (!point || !observedAt || !fresh(observedAt, now, 6 * 60 * 60 * 1_000)) continue;
    const conditions = {
      interstate: condition(raw.interstate),
      primary: condition(raw.primary),
      secondary: condition(raw.secondary),
    };
    if (!conditions.interstate && !conditions.primary && !conditions.secondary) continue;
    const id = text(raw.id);
    if (!id) continue;
    out.push({
      id,
      station: text(raw.name) || text(raw.description) || "Frederick maintenance shop",
      ...point,
      observedAt,
      conditions,
      scope: "maintenance-shop-area",
      evidence: "official-area-report",
      sourceUrl: CHART_ROAD_SOURCES.roadConditions,
    });
  }
  return out.sort((a, b) => a.station.localeCompare(b.station));
}

export function normalizeChartSnowEmergency(
  values: unknown[],
  now = new Date(),
): ChartSnowEmergency[] {
  const out: ChartSnowEmergency[] = [];
  for (const value of values) {
    const raw = object(value);
    if (!raw) continue;
    const countyId = number(raw.countyId);
    if (countyId !== 11 && !/frederick/i.test(text(raw.name))) continue;
    const declaredAt = timestamp(raw.timeDeclared);
    const liftedAt = raw.timeLifted == null || raw.timeLifted === ""
      ? null
      : timestamp(raw.timeLifted);
    if (!declaredAt || Date.parse(declaredAt) > now.getTime() + FUTURE_SKEW_MS) continue;
    if (raw.timeLifted != null && raw.timeLifted !== "" && !liftedAt) continue;
    if (liftedAt && !fresh(liftedAt, now, 24 * 60 * 60 * 1_000)) continue;
    if (liftedAt && Date.parse(liftedAt) < Date.parse(declaredAt)) continue;
    const id = text(raw.id);
    if (!id) continue;
    out.push({
      id,
      county: "Frederick County",
      status: liftedAt ? "lifted" : "active",
      declaredAt,
      liftedAt,
      exception: label(raw.snowEmergencyExceptionMsg),
      evidence: "official-declaration",
      sourceUrl: CHART_ROAD_SOURCES.snowEmergency,
    });
  }
  return out.sort((a, b) => Date.parse(b.declaredAt) - Date.parse(a.declaredAt));
}

async function result<T>(
  sourceUrl: string,
  options: FetchOptions,
  normalize: (values: unknown[], now: Date) => T[],
  observedAt: (value: T) => string | null,
): Promise<ChartFeedResult<T>> {
  const fetched = await fetchRows(sourceUrl, options);
  if (!fetched) return { data: [], available: false };
  const data = normalize(fetched.rows, options.now ?? new Date());
  return {
    data,
    available: true,
    asOf: latest(data.map(observedAt)) ?? fetched.responseAsOf,
  };
}

export function getChartSpeedSensorsFrederickResult(
  options: FetchOptions = {},
): Promise<ChartFeedResult<ChartSpeedSensor>> {
  return result(CHART_ROAD_SOURCES.speeds, options, normalizeChartSpeedSensors,
    (item) => item.observedAt);
}

export function getChartTravelTimesFrederickResult(
  options: FetchOptions = {},
): Promise<ChartFeedResult<ChartTravelTime>> {
  return result(CHART_ROAD_SOURCES.travelTimes, options, normalizeChartTravelTimes,
    (item) => item.observedAt);
}

export function getChartHighwayMessagesFrederickResult(
  options: FetchOptions = {},
): Promise<ChartFeedResult<ChartHighwayMessage>> {
  return result(CHART_ROAD_SOURCES.messages, options, normalizeChartHighwayMessages,
    (item) => item.observedAt);
}

export function getChartRoadWeatherFrederickResult(
  options: FetchOptions = {},
): Promise<ChartFeedResult<ChartRoadWeatherStation>> {
  return result(CHART_ROAD_SOURCES.weatherStations, options, normalizeChartRoadWeather,
    (item) => item.observedAt);
}

export function getChartRoadConditionsFrederickResult(
  options: FetchOptions = {},
): Promise<ChartFeedResult<ChartRoadConditionReport>> {
  return result(CHART_ROAD_SOURCES.roadConditions, options, normalizeChartRoadConditions,
    (item) => item.observedAt);
}

export function getChartSnowEmergencyFrederickResult(
  options: FetchOptions = {},
): Promise<ChartFeedResult<ChartSnowEmergency>> {
  return result(CHART_ROAD_SOURCES.snowEmergency, options, normalizeChartSnowEmergency,
    (item) => item.liftedAt ?? item.declaredAt);
}
