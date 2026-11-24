import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";
import { easternDayKey, easternWallToUtcISO } from "@/lib/tz";
import { cache } from "react";

const AIRNOW_BASE = "https://www.airnowapi.org/aq/observation/current/ziplatlong";
const AIRNOW_TIMEOUT_MS = 4_000;

export type AqiCategory =
  | { id: 1; name: "Good"; color: "#315A43" }
  | { id: 2; name: "Moderate"; color: "#B26B00" }
  | { id: 3; name: "Unhealthy for Sensitive Groups"; color: "#A03A22" }
  | { id: 4; name: "Unhealthy"; color: "#A02929" }
  | { id: 5; name: "Very Unhealthy"; color: "#7E1F1F" }
  | { id: 6; name: "Hazardous"; color: "#5B0000" };

export type AqiObservation = {
  parameter: string;
  aqi: number;
  category: AqiCategory;
  reportingArea: string;
  /** AirNow reporting-area coordinates when supplied. These locate the
   * reporting product; they are not necessarily a monitor location. */
  latitude?: number;
  longitude?: number;
  stateCode?: string;
  dateObserved: string;
  /** Local hour (0-23) the reading was observed — surfaced so the tile can
   *  say "as of 2 PM" instead of showing a bare, undateable number. */
  hourObserved: number;
};

const CATEGORIES: AqiCategory[] = [
  { id: 1, name: "Good", color: "#315A43" },
  { id: 2, name: "Moderate", color: "#B26B00" },
  { id: 3, name: "Unhealthy for Sensitive Groups", color: "#A03A22" },
  { id: 4, name: "Unhealthy", color: "#A02929" },
  { id: 5, name: "Very Unhealthy", color: "#7E1F1F" },
  { id: 6, name: "Hazardous", color: "#5B0000" },
];
const CATEGORY_MAX = [50, 100, 150, 200, 300, 500];
const REPORTING_AREA_FILE = "https://files.airnowtech.org/airnow/today/reportingarea.dat";
// EPA's cityzipcodes.csv maps Frederick ZIP 21701 to this regional product.
const FREDERICK_REPORTING_AREA = "Maryland Piedmont";

function numberValue(value: unknown): number | undefined {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function pollutantValue(parameter: unknown, rawAqi: unknown, rawCategory: unknown) {
  if (typeof parameter !== "string" || !parameter.trim() || typeof rawCategory !== "string") return null;
  const aqi = numberValue(rawAqi);
  if (aqi === undefined || !Number.isInteger(aqi) || aqi < 0 || aqi > 500) return null;
  const category = CATEGORIES[CATEGORY_MAX.findIndex((maximum) => aqi <= maximum)];
  if (category.name.toLowerCase() !== rawCategory.trim().toLowerCase()) return null;
  const name = parameter.trim();
  return { parameter: name.toUpperCase() === "OZONE" ? "O3" : name, aqi, category };
}

function dateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  let year: number;
  let month: number;
  let day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T00:00:00(?:\.0+)?Z?)?$/.exec(raw);
  if (iso) {
    [year, month, day] = iso.slice(1).map(Number);
  } else {
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec(raw);
    if (!us) return null;
    [month, day, year] = us.slice(1).map(Number);
    if (us[3].length === 2) year += 2000;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function localHour(value: unknown): number | null {
  const raw = typeof value === "number" || typeof value === "string" ? String(value).trim() : "";
  if (!/^\d{1,2}(?::00(?::00)?)?$/.test(raw)) return null;
  const hour = Number(raw.split(":")[0]);
  return hour <= 23 ? hour : null;
}

export function parseAirNowObservations(body: unknown, now: Date): AqiObservation[] | null {
  if (!Array.isArray(body)) return null;
  const observations: AqiObservation[] = [];
  for (const row of body) {
    if (!row || typeof row !== "object") continue;
    const value = pollutantValue(row.parameterName, row.nowcastAQI ?? row.aqi, row.aqiCategoryName);
    const dateObserved = dateKey(row.dateObserved);
    const hourObserved = localHour(row.hourObserved);
    const reportingArea = typeof row.reportingAreaName === "string" ? row.reportingAreaName.trim() : "";
    if (!value || !dateObserved || hourObserved === null || !reportingArea) continue;
    if (row.localTimeZone && !["EST", "EDT", "America/New_York"].includes(row.localTimeZone)) continue;
    const observation = {
      ...value, reportingArea, dateObserved, hourObserved,
      latitude: numberValue(row.latitude), longitude: numberValue(row.longitude),
      stateCode: typeof row.stateCode === "string" ? row.stateCode : undefined,
    };
    if (isFreshAqiObservation(observation, now)) observations.push(observation);
  }
  return observations;
}

export type AqiForecast = {
  reportingArea: string;
  parameter: string;
  aqi: number;
  category: AqiCategory;
  validDate: string;
  issueDate: string;
};
type FrederickAirReport = { observations: AqiObservation[]; forecast: AqiForecast | null };

export function parseFrederickAirReport(text: string, now: Date): FrederickAirReport | null {
  const today = easternDayKey(now);
  const observations = new Map<string, AqiObservation>();
  const forecasts = new Map<string, AqiForecast>();
  let foundArea = false;
  for (const line of text.split("\n")) {
    if (!line.includes("|Maryland Piedmont|MD|")) continue;
    const [issue, valid, hour, zone, , kind, , reportingArea, state, lat, lng, param, aqi, category] = line.split("|");
    if (reportingArea !== FREDERICK_REPORTING_AREA || state !== "MD") continue;
    foundArea = true;
    const value = pollutantValue(param, aqi, category);
    const validDate = dateKey(valid);
    const issueDate = dateKey(issue);
    if (!value || !validDate || !issueDate || issueDate > today) continue;
    if (kind === "F" && validDate === today && issueDate <= validDate) {
      const previous = forecasts.get(value.parameter);
      if (!previous || issueDate > previous.issueDate) {
        forecasts.set(value.parameter, { ...value, reportingArea, validDate, issueDate });
      }
    } else if (kind === "O" && ["EST", "EDT"].includes(zone)) {
      const hourObserved = localHour(hour);
      if (hourObserved === null) continue;
      const observation = {
        ...value, reportingArea, dateObserved: validDate, hourObserved,
        latitude: numberValue(lat), longitude: numberValue(lng), stateCode: state,
      };
      const previous = observations.get(value.parameter);
      const newer = !previous || validDate > previous.dateObserved
        || (validDate === previous.dateObserved && hourObserved > previous.hourObserved);
      if (newer && isFreshAqiObservation(observation, now)) observations.set(value.parameter, observation);
    }
  }
  if (!foundArea) return null;
  const forecast = [...forecasts.values()].sort((a, b) => b.aqi - a.aqi)[0] ?? null;
  return { forecast, observations: [...observations.values()] };
}

async function loadFrederickReport(): Promise<FrederickAirReport | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AIRNOW_TIMEOUT_MS);
  try {
    const response = await fetch(REPORTING_AREA_FILE, { signal: ctrl.signal, next: { revalidate: 1800 } });
    if (!response.ok) return null;
    return parseFrederickAirReport(await response.text(), new Date());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const getFrederickAirReport = cache(loadFrederickReport);

async function keyedObservations(lat: number, lng: number, key: string, signal: AbortSignal) {
  const url = new URL(AIRNOW_BASE);
  url.search = new URLSearchParams({
    format: "application/json", latitude: lat.toFixed(4), longitude: lng.toFixed(4), API_KEY: key,
  }).toString();
  try {
    const response = await fetch(url, { signal, next: { revalidate: 1800 } });
    return response.ok ? parseAirNowObservations(await response.json(), new Date()) : null;
  } catch {
    return null;
  }
}

async function loadAirQuality(lat: number, lng: number, deadlineMs: number): Promise<AqiObservation[] | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const key = process.env.AIRNOW_API_KEY;
  const cityCenter = lat === FREDERICK_CENTER.lat && lng === FREDERICK_CENTER.lng;
  if ((!key && !cityCenter) || deadlineMs <= 0) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve(null); }, deadlineMs);
  });
  async function read() {
    const keyed = key ? keyedObservations(lat, lng, key, controller.signal) : null;
    if (!cityCenter) return keyed;
    const regional = getFrederickAirReport().then((report) => report?.observations ?? null);
    if (!keyed) return regional;
    // The key service and the file are independent official publications.
    // An empty response cannot hide fresh observations from the other source.
    const first = await Promise.race([
      keyed.then((rows) => ({ rows, remaining: regional })),
      regional.then((rows) => ({ rows, remaining: keyed })),
    ]);
    if (first.rows?.length) return first.rows;
    return await first.remaining ?? first.rows;
  }
  try {
    return await Promise.race([read(), expired]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}

/**
 * Request-scoped memoization prevents Today's hero and several outdoor
 * recommendation modules from separately decoding the same hourly response.
 * The deadline remains part of the key so a patient background caller never
 * changes a latency-bounded surface's behavior.
 */
const getAirQualityForRequest = cache(loadAirQuality);

export function getAirQuality(
  point: LngLat,
  { deadlineMs = AIRNOW_TIMEOUT_MS }: { deadlineMs?: number } = {},
): Promise<AqiObservation[] | null> {
  return getAirQualityForRequest(point.lat, point.lng, deadlineMs);
}

export function pickWorstAqi(obs: AqiObservation[]): AqiObservation | null {
  if (obs.length === 0) return null;
  return [...obs].sort((a, b) => b.aqi - a.aqi)[0];
}

/** AirNow publishes a local observation date + hour rather than an ISO
 * timestamp. Convert the two documented date shapes to an actual Eastern
 * instant so stale readings never authorize reassuring outdoor guidance. */
export function airQualityObservedAt(obs: AqiObservation): Date | null {
  const observedDate = dateKey(obs.dateObserved);
  if (!observedDate || localHour(obs.hourObserved) === null) return null;
  const [year, month, day] = observedDate.split("-").map(Number);
  const instant = new Date(easternWallToUtcISO(year, month, day, obs.hourObserved, 0));
  return Number.isFinite(instant.getTime()) ? instant : null;
}

/** AirNow is hourly. Three hours is enough room for publication lag without
 * letting an old Good reading hide a changed condition. A one-hour future
 * allowance tolerates monitor/reporting clock skew. */
export function isFreshAqiObservation(
  obs: AqiObservation,
  now = new Date(),
  maxAgeMs = 3 * 60 * 60 * 1_000,
): boolean {
  const observedAt = airQualityObservedAt(obs);
  if (!observedAt) return false;
  const age = now.getTime() - observedAt.getTime();
  return age >= -60 * 60 * 1_000 && age <= maxAgeMs;
}
