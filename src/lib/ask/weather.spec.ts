import { describe, expect, it } from "vitest";
import { askAirQualityLine, askWeatherContext, askWeatherSafetyLine, type AskWeatherSnapshot } from "./weather";

describe("askWeatherContext", () => {
  it("puts active alerts and unhealthy air ahead of the forecast", () => {
    const snapshot: AskWeatherSnapshot = {
      alerts: [{
        id: "alert-1",
        event: "Heat Advisory",
        headline: "Heat Advisory remains in effect",
        description: "",
        severity: "Moderate",
        urgency: "Expected",
        certainty: "Likely",
        starts_at: "2026-07-18T12:00:00Z",
        ends_at: "2026-07-19T00:00:00Z",
        area: "Frederick County, MD",
        url: "https://api.weather.gov/alerts/alert-1",
      }],
      aqi: {
        parameter: "PM2.5",
        aqi: 164,
        category: { id: 4, name: "Unhealthy", color: "#A02929" },
        reportingArea: "Frederick",
        dateObserved: "2026-07-18",
        hourObserved: 14,
      },
      forecast: null,
    };
    const block = askWeatherContext(snapshot);
    expect(block.indexOf("ACTIVE NWS ALERTS")).toBeLessThan(block.indexOf("AIR QUALITY"));
    expect(block).toContain("AQI 164, Unhealthy");
    expect(askWeatherSafetyLine(snapshot)).toContain("AQI 164, Unhealthy");
  });

  it("fails soft when every provider is unavailable", () => {
    expect(askWeatherContext({ forecast: null, alerts: [], aqi: null })).toBe("");
    expect(askAirQualityLine({ forecast: null, alerts: [], aqi: null })).toContain(
      "couldn’t load a fresh AirNow observation",
    );
  });

  it("answers an explicit air-quality question even when conditions are good", () => {
    expect(askAirQualityLine({
      forecast: null,
      alerts: [],
      aqi: {
        parameter: "PM2.5",
        aqi: 38,
        category: { id: 1, name: "Good", color: "#315A43" },
        reportingArea: "Frederick",
        dateObserved: "2026-07-23",
        hourObserved: 9,
      },
    })).toBe("AirNow reports AQI 38, Good, for Frederick.");
  });
});
