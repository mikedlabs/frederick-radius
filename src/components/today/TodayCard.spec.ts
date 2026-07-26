import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compactWeatherRead, WeatherUnavailable } from "./TodayCard";

describe("TodayCard fallback", () => {
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
      safetyNote: "Some safety feeds are unavailable.",
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
