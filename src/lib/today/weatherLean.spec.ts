import { describe, expect, it } from "vitest";
import { leanFromForecast, weatherLean, wetWindowEnd } from "./weatherLean";
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

describe("wetWindowEnd", () => {
  /** Hourly periods on the hour, Eastern-friendly UTC, from a list of labels. */
  function hourly(startUtcHour: number, forecasts: string[]): NwsForecast {
    return {
      asOf: "2026-07-21T00:00:00Z",
      hourly: forecasts.map((shortForecast, i) => ({
        startTime: `2026-07-21T${String(startUtcHour + i).padStart(2, "0")}:00:00Z`,
        endTime: `2026-07-21T${String(startUtcHour + i + 1).padStart(2, "0")}:00:00Z`,
        temperature: 70,
        temperatureUnit: "F",
        shortForecast,
        windSpeed: "5 mph",
        windDirection: "N",
        icon: "",
      })),
      daily: [],
    } as unknown as NwsForecast;
  }

  it("names the hour the rain clears, in Frederick's timezone", () => {
    // 18:00Z through 22:00Z is 2pm to 6pm Eastern in July (UTC-4).
    const fc = hourly(18, ["Rain Showers", "Rain Showers", "Partly Sunny"]);
    expect(wetWindowEnd(fc, new Date("2026-07-21T18:30:00Z"))).toEqual({
      endsAtLabel: "4pm",
      noun: "Rain is",
    });
  });

  it("takes the noun from the forecast instead of always saying storms", () => {
    expect(
      wetWindowEnd(hourly(18, ["Snow", "Sunny"]), new Date("2026-07-21T18:30:00Z")),
    ).toMatchObject({ noun: "Snow is" });
    expect(
      wetWindowEnd(
        hourly(18, ["Scattered Thunderstorms", "Sunny"]),
        new Date("2026-07-21T18:30:00Z"),
      ),
    ).toMatchObject({ noun: "Storms are" });
    expect(
      wetWindowEnd(hourly(18, ["Freezing Drizzle", "Sunny"]), new Date("2026-07-21T18:30:00Z")),
    ).toMatchObject({ noun: "Drizzle is" });
  });

  it("says nothing when the feed's window ends while it is still raining", () => {
    // An unknown end is not a forecast. Better a vaguer sentence than an
    // invented clock time the data cannot support.
    const fc = hourly(18, ["Rain Showers", "Rain Showers", "Thunderstorms"]);
    expect(wetWindowEnd(fc, new Date("2026-07-21T18:30:00Z"))).toBeNull();
  });

  it("says nothing on a dry hour or a missing feed", () => {
    expect(
      wetWindowEnd(hourly(18, ["Sunny", "Rain Showers"]), new Date("2026-07-21T18:30:00Z")),
    ).toBeNull();
    expect(wetWindowEnd(null, new Date())).toBeNull();
  });

  it("agrees with leanFromForecast about which hour is now", () => {
    // The two read the same array; a disagreement would print a rain-clearing
    // time on a page that did not reorder for rain.
    const fc = hourly(18, ["Sunny", "Rain Showers", "Sunny"]);
    const duringRain = new Date("2026-07-21T19:30:00Z");
    expect(leanFromForecast(fc, duringRain)).toBe("wet");
    expect(wetWindowEnd(fc, duringRain)).toMatchObject({ endsAtLabel: "4pm" });
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
