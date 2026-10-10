import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AqiObservation } from "@/lib/integrations/airnow";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { NwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
const mocks = vi.hoisted(() => ({ forecast: vi.fn(), alerts: vi.fn(), air: vi.fn() }));
vi.mock("@/lib/integrations/nws", () => ({ getNwsForecast: mocks.forecast }));
vi.mock("@/lib/integrations/nws-alerts", () => ({ getNwsAlertsResult: mocks.alerts }));
vi.mock("@/lib/integrations/airnow", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/integrations/airnow")>(), getAirQuality: mocks.air,
}));
vi.mock("@/lib/ask/runtime-budget", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/ask/runtime-budget")>(),
  askTextGenerationRuntimeConfigured: () => false,
  askAgentRuntimeConfigured: () => false,
  askRuntimeEmbeddingsConfigured: () => false,
}));
import { askFrederick } from "./answer";
import {
  askAirQualityLine, askWeatherContext, askWeatherSafetyLine,
  askWeatherToolResult, loadAskWeather, type AskWeatherSnapshot,
} from "./weather";

const NOW = new Date("2026-07-21T19:00:00Z");
const GOOD: AqiObservation = {
  parameter: "PM2.5", aqi: 38, category: { id: 1, name: "Good", color: "#315A43" },
  reportingArea: "Frederick", dateObserved: "2026-07-21", hourObserved: 15,
};
const FORECAST: NwsForecast = {
  asOf: NOW.toISOString(), daily: [], hourly: [{
    startTime: NOW.toISOString(), endTime: "2026-07-21T20:00:00Z",
    temperature: 75, temperatureUnit: "F", shortForecast: "Sunny",
    windSpeed: "5 mph", windDirection: "S", icon: "", probabilityOfPrecipitation: 0,
  }],
};
FORECAST.daily = [{ ...FORECAST.hourly[0], name: "Today" }];
function snapshot(): AskWeatherSnapshot {
  return {
    alerts: [], aqi: GOOD, forecast: FORECAST,
    sources: {
      alerts: { available: true, fresh: true, checkedAt: NOW.toISOString() },
      airQuality: { available: true, fresh: true },
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.forecast.mockResolvedValue(FORECAST);
  mocks.alerts.mockResolvedValue({ available: true, alerts: [], checkedAt: NOW.toISOString() });
  mocks.air.mockResolvedValue([GOOD]);
});
afterEach(() => { vi.useRealTimers(); });

describe("Ask weather source evidence", () => {
  it("keeps a working forecast while an official alert feed fails", async () => {
    mocks.alerts.mockResolvedValue({ available: false, alerts: [] });
    const weather = await loadAskWeather(FREDERICK_CENTER, NOW);
    expect(weather.forecast).toEqual(FORECAST);
    expect(weather.sources.alerts).toEqual({ available: false, fresh: false, checkedAt: null });
    expect(askWeatherContext(weather)).toContain("Current weather alerts could not be verified.");
    expect(askWeatherContext(weather)).toContain("NATIONAL WEATHER SERVICE FORECAST");
    expect(askWeatherToolResult(weather, 1)).toMatchObject({
      available: true, safetySourcesCurrent: false,
      sources: { alerts: { available: false, fresh: false } },
      unavailableReason: "Current weather alerts could not be verified.",
      periods: [{ forecast: "Sunny" }],
    });
  });

  it.each([
    { name: "missing", checkedAt: undefined },
    { name: "stale", checkedAt: "2026-07-21T18:44:00Z" },
  ])("keeps $name alert evidence distinct from fresh checked empty alerts", async ({ checkedAt }) => {
    mocks.alerts.mockResolvedValue({ available: true, alerts: [], checkedAt });
    const weather = await loadAskWeather(FREDERICK_CENTER, NOW);
    expect(weather.sources.alerts).toMatchObject({ available: true, fresh: false });
    expect(askWeatherToolResult(weather, 1)).toMatchObject({
      safetySourcesCurrent: false, unavailableReason: "Current weather alerts could not be verified.",
    });
  });

  it.each([
    { name: "empty", observations: [] },
    { name: "stale", observations: [{ ...GOOD, dateObserved: "2026-07-19" }] },
  ])("retains successful but $name AQI status without clear safety evidence", async ({ observations }) => {
    mocks.air.mockResolvedValue(observations);
    const weather = await loadAskWeather(FREDERICK_CENTER, NOW);
    expect(weather.aqi).toBeNull();
    expect(weather.sources.airQuality).toEqual({ available: true, fresh: false });
    expect(askWeatherSafetyLine(weather)).toBe("Current air quality could not be verified.");
    expect(askWeatherToolResult(weather, 1).safetySourcesCurrent).toBe(false);
  });

  it("preserves fresh checked zero alerts and healthy measured air", async () => {
    const weather = await loadAskWeather(FREDERICK_CENTER, NOW);
    expect(askWeatherSafetyLine(weather)).toBeNull();
    expect(askWeatherToolResult(weather, 1)).toMatchObject({
      available: true, safetySourcesCurrent: true, unavailableReason: null,
      alerts: [], airQuality: { aqi: 38, category: "Good" },
    });
    expect(askAirQualityLine(weather)).toBe("AirNow reports AQI 38, Good, for Frederick.");
  });

  it("reports unavailable evidence when all providers reject", async () => {
    mocks.forecast.mockRejectedValue(new Error("offline"));
    mocks.alerts.mockRejectedValue(new Error("offline"));
    mocks.air.mockRejectedValue(new Error("offline"));
    const weather = await loadAskWeather(FREDERICK_CENTER, NOW);
    expect(askWeatherToolResult(weather, 1)).toMatchObject({
      available: false, safetySourcesCurrent: false, periods: [], alerts: [], airQuality: null,
      sources: { alerts: { available: false, fresh: false }, airQuality: { available: false, fresh: false } },
    });
    expect(askWeatherContext(weather)).toContain("Current weather alerts and air quality could not be verified.");
    expect(askAirQualityLine(weather)).toContain("couldn’t load a fresh AirNow observation");
  });

  const storm: NwsAlert = {
    id: "storm-lifecycle", event: "Severe Thunderstorm Warning",
    headline: "Severe Thunderstorm Warning for Frederick County", description: "Lightning is occurring.",
    severity: "Severe", urgency: "Immediate", certainty: "Observed",
    starts_at: "2026-07-21T18:00:00Z", ends_at: "2026-07-21T20:00:00Z",
    area: "Frederick County, MD", url: "https://api.weather.gov/alerts/storm-lifecycle",
  };

  it.each([
    { name: "expired", alert: { ...storm, ends_at: NOW.toISOString() } },
    { name: "future", alert: { ...storm, starts_at: "2026-07-21T19:00:30Z" } },
  ])("does not label a $name cached warning as active", async ({ alert }) => {
    mocks.alerts.mockResolvedValue({ available: true, checkedAt: NOW.toISOString(), alerts: [alert] });
    const weather = await loadAskWeather(FREDERICK_CENTER, NOW);
    expect(weather.alerts).toEqual([]);
    expect(weather.sources.alerts.fresh).toBe(true);
    expect(askWeatherContext(weather)).not.toContain("ACTIVE NWS ALERTS");
    expect(askWeatherSafetyLine(weather)).toBeNull();
    expect(askWeatherToolResult(weather, 1).alerts).toEqual([]);
  });

  it("preserves a currently effective cached warning in copy and tool output", async () => {
    mocks.alerts.mockResolvedValue({ available: true, checkedAt: NOW.toISOString(), alerts: [
      { ...storm, starts_at: "2026-07-21T19:00:30Z" },
    ] });
    const weather = await loadAskWeather(FREDERICK_CENTER, new Date("2026-07-21T19:00:40Z"));
    expect(askWeatherContext(weather)).toContain("ACTIVE NWS ALERTS");
    expect(askWeatherSafetyLine(weather)).toContain("Severe Thunderstorm Warning active");
    expect(askWeatherToolResult(weather, 1).alerts).toMatchObject([{ event: "Severe Thunderstorm Warning" }]);
  });

  it("keeps an active warning ahead of unavailable air-quality copy", () => {
    const weather = snapshot();
    weather.aqi = null;
    weather.sources.airQuality = { available: false, fresh: false };
    weather.alerts = [{
      id: "storm-1", event: "Severe Thunderstorm Warning",
      headline: "Severe Thunderstorm Warning for Frederick County", description: "Lightning is occurring.",
      severity: "Severe", urgency: "Immediate", certainty: "Observed",
      starts_at: "2026-07-21T18:00:00Z", ends_at: "2026-07-21T20:00:00Z",
      area: "Frederick County, MD", url: "https://api.weather.gov/alerts/storm-1",
    }];
    const line = askWeatherSafetyLine(weather)!;
    expect(line.indexOf("Severe Thunderstorm Warning")).toBeLessThan(line.indexOf("could not be verified"));
    const tool = askWeatherToolResult(weather, 1);
    expect(tool.alerts[0].event).toBe("Severe Thunderstorm Warning");
    expect(tool.sources.airQuality.fresh).toBe(false);
  });

  it("puts active alerts and unhealthy air ahead of the forecast", () => {
    const weather = snapshot();
    weather.alerts = [{
      id: "alert-1", event: "Heat Advisory", headline: "Heat Advisory remains in effect", description: "",
      severity: "Moderate", urgency: "Expected", certainty: "Likely",
      starts_at: "2026-07-21T12:00:00Z", ends_at: "2026-07-22T00:00:00Z",
      area: "Frederick County, MD", url: "https://api.weather.gov/alerts/alert-1",
    }];
    weather.aqi = { ...GOOD, aqi: 164, category: { id: 4, name: "Unhealthy", color: "#A02929" } };
    const block = askWeatherContext(weather);
    expect(block.indexOf("ACTIVE NWS ALERTS")).toBeLessThan(block.indexOf("AIR QUALITY"));
    expect(askWeatherSafetyLine(weather)).toContain("AQI 164, Unhealthy");
  });
});


describe("actual deterministic weather answer recovery", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  it("does not claim working alert and air feeds failed when only forecast is missing", async () => {
    mocks.forecast.mockResolvedValue(null);
    const result = await askFrederick("What is the weather forecast?", { origin: FREDERICK_CENTER });
    expect(result.usedModel).toBe(false);
    expect(result.answer).toContain("I couldn’t load the official forecast right now.");
    expect(result.answer).not.toContain("alerts and air quality could not be verified");
    expect(result.answer).not.toContain("active-alert feed");
  });
  it("keeps working forecast copy while identifying unavailable safety evidence", async () => {
    mocks.alerts.mockResolvedValue({ available: false, alerts: [] });
    mocks.air.mockResolvedValue(null);
    const result = await askFrederick("What is the weather forecast?", { origin: FREDERICK_CENTER });
    expect(result.usedModel).toBe(false);
    expect(result.answer).toContain("75°F with sunny");
    expect(result.answer).toContain("Current weather alerts and air quality could not be verified.");
  });
});
