import type { LngLat } from "@/lib/geo";

const NWS_BASE = "https://api.weather.gov";
const UA = "Frederick Radius (miked@madproductions.io)";

export type NwsHourly = {
  startTime: string;
  endTime: string;
  temperature: number;
  temperatureUnit: "F" | "C";
  shortForecast: string;
  windSpeed: string;
  windDirection: string;
  probabilityOfPrecipitation?: number;
  icon: string;
};

export type NwsForecast = {
  asOf: string;
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
    updated: string;
    periods: Array<{
      number: number;
      name: string;
      startTime: string;
      endTime: string;
      temperature: number;
      temperatureUnit: "F" | "C";
      windSpeed: string;
      windDirection: string;
      shortForecast: string;
      icon: string;
      probabilityOfPrecipitation?: { value: number | null };
    }>;
  };
};

async function nwsFetch<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/geo+json" },
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getNwsForecast(point: LngLat): Promise<NwsForecast | null> {
  const lat = point.lat.toFixed(4);
  const lng = point.lng.toFixed(4);
  const points = await nwsFetch<PointsResp>(`${NWS_BASE}/points/${lat},${lng}`, 86400);
  if (!points) return null;

  const [hourly, daily] = await Promise.all([
    nwsFetch<ForecastResp>(points.properties.forecastHourly, 1800),
    nwsFetch<ForecastResp>(points.properties.forecast, 3600),
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
    icon: p.icon,
  });

  return {
    asOf: hourly?.properties.updated ?? daily?.properties.updated ?? new Date().toISOString(),
    hourly: (hourly?.properties.periods ?? []).slice(0, 12).map(mapPeriod),
    daily: (daily?.properties.periods ?? []).slice(0, 7).map(mapPeriod),
  };
}

export function iconForShortForecast(s: string): "Sun" | "CloudSun" | "Cloud" | "CloudRain" | "CloudSnow" | "Wind" | "CloudFog" | "CloudLightning" {
  const t = s.toLowerCase();
  if (t.includes("thunder") || t.includes("storm")) return "CloudLightning";
  if (t.includes("snow") || t.includes("flurr") || t.includes("ice") || t.includes("sleet")) return "CloudSnow";
  if (t.includes("rain") || t.includes("shower") || t.includes("drizzle")) return "CloudRain";
  if (t.includes("fog") || t.includes("haze") || t.includes("smoke")) return "CloudFog";
  if (t.includes("wind")) return "Wind";
  if (t.includes("clear") || t.includes("sunny")) return "Sun";
  if (t.includes("partly")) return "CloudSun";
  if (t.includes("cloud") || t.includes("overcast")) return "Cloud";
  return "CloudSun";
}
