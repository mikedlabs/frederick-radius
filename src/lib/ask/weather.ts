import type { LngLat } from "@/lib/geo";
import { getNwsForecast, type NwsForecast } from "@/lib/integrations/nws";
import { getNwsAlerts, type NwsAlert } from "@/lib/integrations/nws-alerts";
import {
  getAirQuality,
  isFreshAqiObservation,
  pickWorstAqi,
  type AqiObservation,
} from "@/lib/integrations/airnow";

export type AskWeatherSnapshot = {
  forecast: NwsForecast | null;
  alerts: NwsAlert[];
  aqi: AqiObservation | null;
};

/** Fetch every safety-relevant weather layer independently. A failed optional
 * provider cannot erase a working NWS alert or forecast. */
export async function loadAskWeather(point: LngLat, now = new Date()): Promise<AskWeatherSnapshot> {
  const [forecastResult, alertsResult, airResult] = await Promise.allSettled([
    getNwsForecast(point),
    getNwsAlerts(),
    getAirQuality(point),
  ]);
  const observations = airResult.status === "fulfilled" ? airResult.value ?? [] : [];
  const fresh = observations.filter((observation) => isFreshAqiObservation(observation, now));
  return {
    forecast: forecastResult.status === "fulfilled" ? forecastResult.value : null,
    alerts: alertsResult.status === "fulfilled" ? alertsResult.value : [],
    aqi: pickWorstAqi(fresh),
  };
}

export function askWeatherContext(snapshot: AskWeatherSnapshot): string {
  const sections: string[] = [];
  if (snapshot.alerts.length > 0) {
    const severity = { Extreme: 5, Severe: 4, Moderate: 3, Minor: 2, Unknown: 1 } as const;
    const lines = [...snapshot.alerts]
      .sort((a, b) => severity[b.severity] - severity[a.severity])
      .slice(0, 3)
      .map((alert) => `- ${alert.event} (${alert.severity}): ${alert.headline}`);
    sections.push(`ACTIVE NWS ALERTS FOR FREDERICK COUNTY:\n${lines.join("\n")}`);
  }
  if (snapshot.aqi) {
    sections.push(
      `AIR QUALITY (live AirNow observation): AQI ${snapshot.aqi.aqi}, ${snapshot.aqi.category.name}, reported for ${snapshot.aqi.reportingArea}.`,
    );
  }
  const days = (snapshot.forecast?.daily ?? []).filter((period) => period.name).slice(0, 4);
  if (days.length > 0) {
    const lines = days.map((period) => {
      const rain = period.probabilityOfPrecipitation;
      return `- ${period.name}: ${period.temperature}°${period.temperatureUnit}, ${period.shortForecast}${rain != null ? `, ${rain}% chance of precipitation` : ""}`;
    });
    sections.push(`NATIONAL WEATHER SERVICE FORECAST FOR FREDERICK:\n${lines.join("\n")}`);
  }
  return sections.length > 0 ? `WEATHER AND OUTDOOR SAFETY:\n${sections.join("\n")}\n\n` : "";
}

export function askWeatherSafetyLine(snapshot: AskWeatherSnapshot): string | null {
  const parts: string[] = [];
  if (snapshot.alerts.length > 0) {
    const names = [...new Set(snapshot.alerts.map((alert) => alert.event))].slice(0, 2);
    parts.push(`The National Weather Service has ${names.join(" and ")} active for Frederick County.`);
  }
  if (snapshot.aqi && snapshot.aqi.category.id >= 3) {
    parts.push(`AirNow reports AQI ${snapshot.aqi.aqi}, ${snapshot.aqi.category.name}, for ${snapshot.aqi.reportingArea}.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
