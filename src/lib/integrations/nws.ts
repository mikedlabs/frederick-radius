import type { LngLat } from "@/lib/geo";
import { cache } from "react";

const NWS_BASE = "https://api.weather.gov";
const UA = "Frederick Radius (hello@frederickradius.app)";

export type NwsHourly = {
  startTime: string;
  endTime: string;
  temperature: number;
  temperatureUnit: "F" | "C";
  shortForecast: string;
  windSpeed: string;
  windDirection: string;
  probabilityOfPrecipitation?: number;
  /** Relative humidity %, present on hourly periods. */
  relativeHumidity?: number;
  /** Dewpoint in CELSIUS (NWS native unit), present on hourly periods. */
  dewpointC?: number;
  icon: string;
  /** Daily periods carry these; hourly periods leave them undefined. */
  name?: string;
  isDaytime?: boolean;
  detailedForecast?: string;
};

export type NwsForecast = {
  /** When the National Weather Service ISSUED this forecast, or null when the
   *  payload does not carry an issuance time. NEVER the time we rendered. */
  asOf: string | null;
  hourly: NwsHourly[];
  daily: NwsHourly[];
};

type PointsResp = {
  properties: {
    forecast: string;
    forecastHourly: string;
    forecastZone: string;
    relativeLocation?: { properties?: { city?: string; state?: string } };
  };
};

type ForecastResp = {
  properties: {
    // The live api.weather.gov payload carries `updateTime` (forecast
    // issuance) and `generatedAt` (when the API answered). It has never
    // carried `updated`, which this type declared as REQUIRED — so the
    // `?? new Date()` fallback below looked like an unreachable safety net
    // while being the only path that ever ran. Optional now, so the compiler
    // stops vouching for a field the service does not send.
    updated?: string;
    updateTime?: string;
    periods: Array<{
      number: number;
      name: string;
      startTime: string;
      endTime: string;
      isDaytime: boolean;
      temperature: number;
      temperatureUnit: "F" | "C";
      windSpeed: string;
      windDirection: string;
      shortForecast: string;
      detailedForecast?: string;
      icon: string;
      probabilityOfPrecipitation?: { value: number | null };
      relativeHumidity?: { value: number | null };
      dewpoint?: { value: number | null };
    }>;
  };
};

async function nwsFetch<T>(url: string, revalidate: number, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/geo+json" },
      next: { revalidate },
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function loadNwsForecast(latValue: number, lngValue: number): Promise<NwsForecast | null> {
  // One deadline covers the points lookup and both forecast requests. NWS is
  // useful context, never a reason to withhold the page shell.
  const signal = AbortSignal.timeout(5000);
  const lat = latValue.toFixed(4);
  const lng = lngValue.toFixed(4);
  const points = await nwsFetch<PointsResp>(`${NWS_BASE}/points/${lat},${lng}`, 86400, signal);
  if (!points) return null;

  const [hourly, daily] = await Promise.all([
    nwsFetch<ForecastResp>(points.properties.forecastHourly, 1800, signal),
    nwsFetch<ForecastResp>(points.properties.forecast, 3600, signal),
  ]);

  const mapPeriod = (p: ForecastResp["properties"]["periods"][number]): NwsHourly => ({
    startTime: p.startTime,
    endTime: p.endTime,
    temperature: p.temperature,
    temperatureUnit: p.temperatureUnit,
    shortForecast: p.shortForecast,
    windSpeed: p.windSpeed,
    windDirection: p.windDirection,
    probabilityOfPrecipitation: p.probabilityOfPrecipitation?.value ?? undefined,
    relativeHumidity: p.relativeHumidity?.value ?? undefined,
    dewpointC: p.dewpoint?.value ?? undefined,
    icon: p.icon,
    name: p.name,
    isDaytime: p.isDaytime,
    detailedForecast: p.detailedForecast,
  });

  // Drop hourly periods that have ALREADY ended before slicing, so hourly[0]
  // is always the current hour — not a stale past hour. The NWS payload is
  // HTTP-cached (revalidate: 1800), so on a cache hit its first periods can be
  // 20-30 min in the past; every consumer treats hourly[0] as "now" and the
  // slice(0,12) as "the next 12 hours" (TodayCard's "Spotty showers around",
  // the hourly strips, PoP curves), so a past front period surfaces the wrong
  // read. This filter runs at request time (getNwsForecast is called per
  // render; only the fetch is cached), so it re-anchors to the real now on
  // every render regardless of cache age. endTime <= now means fully past.
  const now = Date.now();
  const hourlyCurrent = (hourly?.properties.periods ?? []).filter(
    (p) => new Date(p.endTime).getTime() > now,
  );

  return {
    // Issuance time, never the render clock. Stamping `new Date()` here and
    // labelling it "NWS" made the panel advance its timestamp on every render
    // while the values underneath sat still for the 30-minute cache — on
    // production it read 12:14, 12:27 and 12:29 PM against an unchanged
    // forecast issued at 14:53Z. A missing time is now null, and the UI says
    // so rather than inventing one.
    asOf:
      hourly?.properties.updateTime ??
      daily?.properties.updateTime ??
      hourly?.properties.updated ??
      daily?.properties.updated ??
      null,
    hourly: hourlyCurrent.slice(0, 12).map(mapPeriod),
    // 14 periods = ~7 days of day/night pairs, grouped into days by the UI.
    daily: (daily?.properties.periods ?? []).slice(0, 14).map(mapPeriod),
  };
}

/**
 * React request memoization is intentional here. Today uses the same Frederick
 * forecast for its weather lean, hero, tomorrow preview, and idea rail. Next's
 * HTTP cache avoids repeated upstream traffic, but without this wrapper every
 * consumer still rebuilt and parsed the forecast independently during one ISR
 * regeneration. Primitive coordinate keys also coalesce equal point objects.
 */
const getNwsForecastForRequest = cache(loadNwsForecast);

export function getNwsForecast(point: LngLat): Promise<NwsForecast | null> {
  return getNwsForecastForRequest(point.lat, point.lng);
}

export function iconForShortForecast(
  s: string,
  isDaytime = true,
): "Sun" | "Moon" | "CloudSun" | "CloudMoon" | "Cloud" | "CloudRain" | "CloudSnow" | "Wind" | "CloudFog" | "CloudLightning" {
  const t = s.toLowerCase();
  if (t.includes("thunder") || t.includes("storm")) return "CloudLightning";
  if (t.includes("snow") || t.includes("flurr") || t.includes("ice") || t.includes("sleet")) return "CloudSnow";
  if (t.includes("rain") || t.includes("shower") || t.includes("drizzle")) return "CloudRain";
  if (t.includes("fog") || t.includes("haze") || t.includes("smoke")) return "CloudFog";
  if (t.includes("wind")) return "Wind";
  // Clear / partly are the only conditions that read differently by day
  // vs night — a clear night should show the moon, not a rotating sun.
  if (t.includes("clear") || t.includes("sunny")) return isDaytime ? "Sun" : "Moon";
  if (t.includes("partly")) return isDaytime ? "CloudSun" : "CloudMoon";
  if (t.includes("cloud") || t.includes("overcast")) return "Cloud";
  return isDaytime ? "CloudSun" : "CloudMoon";
}
