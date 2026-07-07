import { describe, it, expect } from "vitest";
import { isActivelyWet, weatherVerdict } from "@/lib/weather-verdict";

// Regression guard: the /today "Right now" move + the TodayCard mood line
// were claiming "Rain's in play" off the forecast TEXT alone, so a
// "Scattered Rain Showers" day at low probability read as raining when it
// was dry on the ground. isActivelyWet gates on real precipitation odds.
describe("isActivelyWet", () => {
  it("is wet when rain is likely (>=50% PoP)", () => {
    expect(isActivelyWet("Rain Showers", 70)).toBe(true);
    expect(isActivelyWet("Light Rain", 50)).toBe(true);
    expect(isActivelyWet("Drizzle", 80)).toBe(true);
  });

  it("is NOT wet for low-probability/scattered forecasts (the reported bug)", () => {
    expect(isActivelyWet("Scattered Rain Showers", 30)).toBe(false);
    expect(isActivelyWet("Chance Rain Showers", 40)).toBe(false);
    expect(isActivelyWet("Slight Chance Showers", 20)).toBe(false);
  });

  it("is NOT wet when the forecast is dry, whatever the number", () => {
    expect(isActivelyWet("Sunny", 0)).toBe(false);
    expect(isActivelyWet("Partly Cloudy", 60)).toBe(false);
    expect(isActivelyWet("Mostly Clear", 100)).toBe(false);
  });

  it("treats missing precip probability as not-wet (never over-claim)", () => {
    expect(isActivelyWet("Rain Showers", null)).toBe(false);
    expect(isActivelyWet("Rain Showers", undefined)).toBe(false);
  });
});

// UX audit QW-7: the verdict must not contradict the sky it sits beside.
describe("weatherVerdict horizon honesty", () => {
  const now = new Date("2026-07-07T18:00:00-04:00"); // 6 PM ET
  const hour = (offsetH: number, shortForecast: string, pop = 0) => ({
    startTime: new Date(now.getTime() + offsetH * 3_600_000).toISOString(),
    probabilityOfPrecipitation: pop,
    shortForecast,
  });

  it("warns when storms sit in the next six hours, even if now is clear", () => {
    const v = weatherVerdict({
      temp: 78,
      shortForecast: "Mostly Clear",
      precipNow: 0,
      hourly: [hour(1, "Mostly Clear"), hour(3, "Scattered Thunderstorms", 60)],
      now,
    });
    expect(v.tone).toBe("rough");
    expect(v.line).toMatch(/storms/i);
  });

  it("gives a neutral line (not a cheerful one) when rain is in the text below the wet bar", () => {
    const v = weatherVerdict({
      temp: 72,
      shortForecast: "Scattered Rain Showers",
      precipNow: 30,
      hourly: [],
      now,
    });
    expect(v.tone).toBe("mixed");
    expect(v.line).not.toMatch(/patio|clear|good day/i);
  });

  it("still reads clear when the horizon is clean", () => {
    const v = weatherVerdict({
      temp: 75,
      shortForecast: "Clear",
      precipNow: 0,
      hourly: [hour(2, "Clear"), hour(4, "Mostly Clear")],
      now,
    });
    expect(v.tone).toBe("good");
  });
});
