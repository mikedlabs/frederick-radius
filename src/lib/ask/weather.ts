import type { LngLat } from "@/lib/geo";
import { getNwsForecast, type NwsForecast } from "@/lib/integrations/nws";
import { getNwsAlertsResult, type NwsAlert, type NwsAlertsResult } from "@/lib/integrations/nws-alerts";
import { activeNwsAlerts, isFreshNwsAlertsResult } from "@/lib/weather-safety";
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
  sources: {
    alerts: { available: boolean; fresh: boolean; checkedAt: string | null };
    airQuality: { available: boolean; fresh: boolean };
  };
};

/** Fetch every safety-relevant weather layer independently. A failed optional
 * provider cannot erase a working NWS alert or forecast. */
export async function loadAskWeather(point: LngLat, now = new Date()): Promise<AskWeatherSnapshot> {
  const [forecastResult, alertsResult, airResult] = await Promise.allSettled([
    getNwsForecast(point),
    getNwsAlertsResult(),
    getAirQuality(point),
  ]);
  const alerts: NwsAlertsResult = alertsResult.status === "fulfilled"
    ? alertsResult.value
    : { available: false, alerts: [] };
  const observations = airResult.status === "fulfilled" ? airResult.value : null;
  const fresh = (observations ?? []).filter((observation) => isFreshAqiObservation(observation, now));
  return {
    forecast: forecastResult.status === "fulfilled" ? forecastResult.value : null,
    alerts: activeNwsAlerts(alerts.alerts, now),
    aqi: pickWorstAqi(fresh),
    sources: {
      alerts: {
        available: alerts.available,
        fresh: isFreshNwsAlertsResult(alerts, now),
        checkedAt: alerts.checkedAt ?? null,
      },
      airQuality: { available: observations !== null, fresh: fresh.length > 0 },
    },
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
  const unavailable = askWeatherUnavailableLine(snapshot);
  if (unavailable) sections.push(unavailable);
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
  const unavailable = askWeatherUnavailableLine(snapshot);
  if (unavailable) parts.push(unavailable);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function askAirQualityLine(snapshot: AskWeatherSnapshot | null): string {
  return snapshot?.aqi
    ? `AirNow reports AQI ${snapshot.aqi.aqi}, ${snapshot.aqi.category.name}, for ${snapshot.aqi.reportingArea}.`
    : "I couldn’t load a fresh AirNow observation right now.";
}

/** Keep partial forecast data useful without implying a completed safety check. */
export function askWeatherUnavailableLine(snapshot: AskWeatherSnapshot): string | null {
  const alerts = !snapshot.sources.alerts.fresh;
  const air = !snapshot.sources.airQuality.fresh;
  if (alerts && air) return "Current weather alerts and air quality could not be verified.";
  if (alerts) return "Current weather alerts could not be verified.";
  if (air) return "Current air quality could not be verified.";
  return null;
}

export function askWeatherToolResult(snapshot: AskWeatherSnapshot, hours: number) {
  return {
    available: Boolean(snapshot.forecast || snapshot.sources.alerts.available || snapshot.sources.airQuality.available),
    safetySourcesCurrent: snapshot.sources.alerts.fresh && snapshot.sources.airQuality.fresh,
    sources: snapshot.sources,
    unavailableReason: askWeatherUnavailableLine(snapshot),
    asOf: snapshot.forecast?.asOf ?? null,
    alerts: snapshot.alerts.map((alert) => ({
      event: alert.event, headline: alert.headline, severity: alert.severity,
      endsAt: alert.ends_at, url: alert.url,
    })),
    airQuality: snapshot.aqi ? {
      aqi: snapshot.aqi.aqi, category: snapshot.aqi.category.name,
      reportingArea: snapshot.aqi.reportingArea,
    } : null,
    periods: (snapshot.forecast?.hourly ?? []).slice(0, hours).map((period) => ({
      start: period.startTime,
      temperature: `${period.temperature}°${period.temperatureUnit}`,
      forecast: period.shortForecast,
      rainChance: period.probabilityOfPrecipitation ?? null,
    })),
  };
}
