import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  compactWeatherRead,
  sentenceCaseForecast,
  TODAY_SAFETY_GLANCE_DEADLINE_MS,
  WeatherUnavailable,
  weatherRowFacts,
  weatherRowLine,
} from "./TodayCard";

describe("TodayCard fallback", () => {
  it("presents the NWS short forecast as natural sentence case", () => {
    expect(sentenceCaseForecast("Chance Showers And Thunderstorms")).toBe(
      "Chance showers and thunderstorms",
    );
  });

  it("gives a cold safety read time to resolve without stalling the page", () => {
    expect(TODAY_SAFETY_GLANCE_DEADLINE_MS).toBeGreaterThanOrEqual(2_000);
    expect(TODAY_SAFETY_GLANCE_DEADLINE_MS).toBeLessThanOrEqual(3_000);
  });

  it("turns a forecast miss into a compact County status handoff", () => {
    const html = renderToStaticMarkup(createElement(WeatherUnavailable));

    expect(html).toContain('data-weather-state="unavailable"');
    expect(html).toContain("The NWS forecast is briefly unavailable.");
    expect(html).toContain("County status");
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

describe("Today's weather row", () => {
  const hour = (startTime: string, temperature: number, shortForecast: string) => ({
    startTime,
    endTime: startTime,
    temperature,
    temperatureUnit: "F" as const,
    shortForecast,
    windSpeed: "5 mph",
    windDirection: "W",
    icon: "",
  });
  const period = (
    startTime: string,
    isDaytime: boolean,
    temperature: number,
  ) => ({
    ...hour(startTime, temperature, isDaytime ? "Sunny" : "Clear"),
    name: isDaytime ? "This Afternoon" : "Tonight",
    isDaytime,
  });

  // 2 PM Wednesday Oct 7, Eastern.
  const AFTERNOON = new Date("2026-10-07T18:00:00.000Z");
  // 8 PM Wednesday Oct 7, Eastern.
  const EVENING = new Date("2026-10-08T00:00:00.000Z");

  it("reads the current temperature, condition, today's high and tonight's low", () => {
    const facts = weatherRowFacts(
      {
        asOf: null,
        hourly: [hour("2026-10-07T18:00:00.000Z", 62, "Mostly Sunny")],
        daily: [
          period("2026-10-07T18:00:00.000Z", true, 76),
          period("2026-10-07T22:00:00.000Z", false, 55),
          period("2026-10-08T10:00:00.000Z", true, 71),
        ],
      },
      AFTERNOON,
    );
    expect(facts).toEqual({ temperature: 62, condition: "Mostly sunny", high: 76, low: 55 });
    expect(weatherRowLine(facts)).toBe("Mostly sunny · High 76° · Low 55°");
  });

  it("never labels tomorrow's high as today's once the afternoon period has ended", () => {
    const facts = weatherRowFacts(
      {
        asOf: null,
        hourly: [hour("2026-10-08T00:00:00.000Z", 58, "Clear")],
        daily: [
          period("2026-10-07T22:00:00.000Z", false, 55),
          period("2026-10-08T10:00:00.000Z", true, 71),
        ],
      },
      EVENING,
    );
    expect(facts.high).toBeNull();
    expect(facts.low).toBe(55);
    expect(weatherRowLine(facts)).toBe("Clear · Low 55°");
  });

  it("leaves out every piece the forecast lacks instead of guessing", () => {
    const empty = weatherRowFacts(null, AFTERNOON);
    expect(empty).toEqual({ temperature: null, condition: null, high: null, low: null });
    expect(weatherRowLine(empty)).toBeNull();
    expect(
      weatherRowLine({ temperature: 62, condition: null, high: 76, low: null }),
    ).toBe("High 76°");
  });

  it("collapses the unavailable state to one line on the named type scale", () => {
    const html = renderToStaticMarkup(createElement(WeatherUnavailable));
    expect(html).toContain("text-meta-lg");
    expect(html).not.toMatch(/text-\[\d/);
    expect(html).not.toContain("<section");
  });
});
