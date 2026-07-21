import { describe, expect, it } from "vitest";
import { leanFromForecast, weatherLean } from "./weatherLean";
import { daypartNeeds } from "./daypart-needs";
import type { NwsForecast } from "@/lib/integrations/nws";

describe("weatherLean", () => {
  it("reads storms and rain as wet", () => {
    expect(weatherLean("Scattered Thunderstorms", 86)).toBe("wet");
    expect(weatherLean("Light Rain Showers", 60)).toBe("wet");
    expect(weatherLean("Chance Drizzle", 55)).toBe("wet");
  });

  it("treats a high precip chance as wet even with a dry label", () => {
    expect(weatherLean("Mostly Cloudy", 80, 70)).toBe("wet");
    expect(weatherLean("Mostly Cloudy", 80, 30)).toBe(null);
  });

  it("reads 92 and up as hot, with wet taking precedence", () => {
    expect(weatherLean("Sunny", 95)).toBe("hot");
    expect(weatherLean("Sunny", 91)).toBe(null);
    expect(weatherLean("Thunderstorms", 95)).toBe("wet");
  });

  it("a missing forecast is an ordinary day, never a guessed one", () => {
    expect(weatherLean(null, null)).toBe(null);
    expect(leanFromForecast(null, new Date())).toBe(null);
  });

  it("leanFromForecast picks the hourly period covering now", () => {
    const now = new Date("2026-07-21T18:30:00Z");
    const fc = {
      asOf: "2026-07-21T18:00:00Z",
      hourly: [
        {
          startTime: "2026-07-21T17:00:00Z",
          endTime: "2026-07-21T18:00:00Z",
          temperature: 88,
          temperatureUnit: "F",
          shortForecast: "Sunny",
          windSpeed: "5 mph",
          windDirection: "N",
          icon: "",
        },
        {
          startTime: "2026-07-21T18:00:00Z",
          endTime: "2026-07-21T19:00:00Z",
          temperature: 86,
          temperatureUnit: "F",
          shortForecast: "Thunderstorms",
          windSpeed: "5 mph",
          windDirection: "N",
          icon: "",
        },
      ],
      daily: [],
    } as unknown as NwsForecast;
    expect(leanFromForecast(fc, now)).toBe("wet");
  });
});

describe("daypartNeeds with a lean", () => {
  it("wet leads with indoor needs without duplicating the base set", () => {
    const needs = daypartNeeds(14, "wet");
    expect(needs[0].category).toBe("museum");
    expect(needs.some((n) => n.category === "book-store")).toBe(true);
    const cats = needs.map((n) => n.category);
    expect(new Set(cats).size).toBe(cats.length);
  });

  it("hot leads with cool-down treats", () => {
    expect(daypartNeeds(14, "hot")[0].category).toBe("ice-cream");
  });

  it("no lean leaves the daypart untouched", () => {
    expect(daypartNeeds(8, null)[0].category).toBe("coffee");
  });
});
