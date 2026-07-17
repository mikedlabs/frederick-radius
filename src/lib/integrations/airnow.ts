import type { LngLat } from "@/lib/geo";
import { easternWallToUtcISO } from "@/lib/tz";

const AIRNOW_BASE = "https://www.airnowapi.org/aq/observation/latLong/current";

export type AqiCategory =
  | { id: 1; name: "Good"; color: "#1E6B3A" }
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
  dateObserved: string;
  /** Local hour (0-23) the reading was observed — surfaced so the tile can
   *  say "as of 2 PM" instead of showing a bare, undateable number. */
  hourObserved: number;
};

type AirNowResp = Array<{
  ParameterName: string;
  AQI: number;
  Category: { Number: number; Name: string };
  ReportingArea: string;
  DateObserved: string;
  HourObserved: number;
}>;

const COLORS: Record<number, string> = {
  1: "#1E6B3A", 2: "#B26B00", 3: "#A03A22", 4: "#A02929", 5: "#7E1F1F", 6: "#5B0000",
};

export async function getAirQuality(point: LngLat): Promise<AqiObservation[] | null> {
  const key = process.env.AIRNOW_API_KEY;
  if (!key) return null;

  const url =
    `${AIRNOW_BASE}/?format=application/json` +
    `&latitude=${point.lat.toFixed(4)}&longitude=${point.lng.toFixed(4)}` +
    `&distance=25&API_KEY=${key}`;

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const data = (await res.json()) as AirNowResp;
    return data.map((r) => ({
      parameter: r.ParameterName,
      aqi: r.AQI,
      category: {
        id: r.Category.Number,
        name: r.Category.Name,
        color: COLORS[r.Category.Number] ?? "#7A7975",
      } as AqiCategory,
      reportingArea: r.ReportingArea,
      dateObserved: r.DateObserved,
      hourObserved: r.HourObserved,
    }));
  } catch {
    return null;
  }
}

export function pickWorstAqi(obs: AqiObservation[]): AqiObservation | null {
  if (obs.length === 0) return null;
  return [...obs].sort((a, b) => b.aqi - a.aqi)[0];
}

/** AirNow publishes a local observation date + hour rather than an ISO
 * timestamp. Convert the two documented date shapes to an actual Eastern
 * instant so stale readings never authorize reassuring outdoor guidance. */
export function airQualityObservedAt(obs: AqiObservation): Date | null {
  const raw = obs.dateObserved.trim();
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  const year = ymd ? Number(ymd[1]) : mdy ? Number(mdy[3]) : NaN;
  const month = ymd ? Number(ymd[2]) : mdy ? Number(mdy[1]) : NaN;
  const day = ymd ? Number(ymd[3]) : mdy ? Number(mdy[2]) : NaN;
  if (![year, month, day, obs.hourObserved].every(Number.isFinite)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || obs.hourObserved < 0 || obs.hourObserved > 23) {
    return null;
  }
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
