import { describe, expect, it } from "vitest";
import { rainyDayIsRelevant } from "./weather-context";
import type { NwsHourly } from "@/lib/integrations/nws";

const period = (shortForecast: string, probabilityOfPrecipitation: number): NwsHourly => ({
  startTime: "2026-07-15T12:00:00-04:00",
  endTime: "2026-07-15T13:00:00-04:00",
  temperature: 80,
  temperatureUnit: "F",
  shortForecast,
  windSpeed: "5 mph",
  windDirection: "W",
  probabilityOfPrecipitation,
  icon: "",
});

describe("rainyDayIsRelevant", () => {
  it("hides the rainy collection on a clear forecast", () => {
    expect(rainyDayIsRelevant([period("Sunny", 5), period("Mostly clear", 10)])).toBe(false);
  });

  it("shows it for meaningful near-term rain", () => {
    expect(rainyDayIsRelevant([period("Chance Rain Showers", 40)])).toBe(true);
  });
});
