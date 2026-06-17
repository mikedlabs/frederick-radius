import { describe, it, expect } from "vitest";
import { isActivelyWet } from "@/lib/weather-verdict";

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
