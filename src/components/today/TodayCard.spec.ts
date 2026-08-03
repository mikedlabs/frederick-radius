import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  compactWeatherRead,
  TODAY_SAFETY_GLANCE_DEADLINE_MS,
  WeatherUnavailable,
} from "./TodayCard";

describe("TodayCard fallback", () => {
  it("keeps the above-the-fold safety glance within a one-second budget", () => {
    expect(TODAY_SAFETY_GLANCE_DEADLINE_MS).toBeGreaterThanOrEqual(500);
    expect(TODAY_SAFETY_GLANCE_DEADLINE_MS).toBeLessThanOrEqual(1_000);
  });

  it("turns a forecast miss into a compact live-conditions handoff", () => {
    const html = renderToStaticMarkup(createElement(WeatherUnavailable));

    expect(html).toContain('data-weather-state="unavailable"');
    expect(html).toContain("The forecast is briefly unavailable.");
    expect(html).toContain("Live conditions");
    expect(html).not.toContain("text-[40px]");
  });

  it("keeps a partial safety-feed miss out of the main weather headline", () => {
    expect(
      compactWeatherRead({
        verdict: "Some safety data is temporarily unavailable.",
        condition: "Mostly sunny",
        alertsAvailable: false,
        airQualityAvailable: true,
        activeAlertCount: 0,
        airQualityIndex: 42,
      }),
    ).toEqual({
      headline: "Mostly sunny",
      safetyNote: "The weather-alert feed is unavailable.",
    });
  });

  it("names an unavailable air-quality reading", () => {
    expect(
      compactWeatherRead({
        verdict: "Some safety data is temporarily unavailable.",
        condition: "Mostly sunny",
        alertsAvailable: true,
        airQualityAvailable: false,
        activeAlertCount: 0,
        airQualityIndex: null,
      }),
    ).toEqual({
      headline: "Mostly sunny",
      safetyNote: "The air-quality reading is unavailable.",
    });
  });

  it("does not soften an active alert or unhealthy air reading", () => {
    expect(
      compactWeatherRead({
        verdict: "Air quality is unhealthy.",
        condition: "Mostly sunny",
        alertsAvailable: true,
        airQualityAvailable: true,
        activeAlertCount: 0,
        airQualityIndex: 151,
      }),
    ).toEqual({
      headline: "Air quality is unhealthy.",
      safetyNote: null,
    });
  });
});
