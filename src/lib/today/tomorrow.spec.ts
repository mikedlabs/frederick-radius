import { describe, it, expect } from "vitest";
import { isTomorrowPreviewTime, tomorrowDaytimeForecast } from "./tomorrow";
import type { NwsForecast, NwsHourly } from "@/lib/integrations/nws";

describe("isTomorrowPreviewTime — strictly gated on the Eastern clock", () => {
  it("is false through the day and evening (never leaks into daytime)", () => {
    expect(isTomorrowPreviewTime(new Date("2026-07-08T13:00:00.000Z"))).toBe(false); // 9 AM ET
    expect(isTomorrowPreviewTime(new Date("2026-07-08T23:00:00.000Z"))).toBe(false); // 7 PM ET
    expect(isTomorrowPreviewTime(new Date("2026-07-09T00:59:00.000Z"))).toBe(false); // 8:59 PM ET
  });

  it("turns on at 9 PM and stays on through the small hours", () => {
    expect(isTomorrowPreviewTime(new Date("2026-07-09T01:00:00.000Z"))).toBe(true); // 9:00 PM ET
    expect(isTomorrowPreviewTime(new Date("2026-07-09T01:30:00.000Z"))).toBe(true); // 9:30 PM ET
    expect(isTomorrowPreviewTime(new Date("2026-07-09T06:00:00.000Z"))).toBe(true); // 2:00 AM ET
  });
});

function daily(periods: Partial<NwsHourly>[]): NwsForecast {
  return { asOf: "", hourly: [], daily: periods as NwsHourly[] };
}

describe("tomorrowDaytimeForecast — the next day's daytime high, never guessed", () => {
  // Late on Jul 8 ET (11 PM), tomorrow is Jul 9.
  const now = new Date("2026-07-09T03:00:00.000Z");

  it("finds the daytime period whose Eastern day is tomorrow", () => {
    const wx = tomorrowDaytimeForecast(
      daily([
        { startTime: "2026-07-09T02:00:00-04:00", isDaytime: false, temperature: 68, shortForecast: "Clear" }, // tonight
        { startTime: "2026-07-09T08:00:00-04:00", isDaytime: true, temperature: 84, shortForecast: "Mostly Sunny" }, // tomorrow day
      ]),
      now,
    );
    expect(wx).toEqual({ temp: 84, shortForecast: "Mostly Sunny" });
  });

  it("returns null when no forecast reaches tomorrow (omit, don't fabricate)", () => {
    expect(tomorrowDaytimeForecast(null, now)).toBeNull();
    expect(
      tomorrowDaytimeForecast(
        daily([{ startTime: "2026-07-11T08:00:00-04:00", isDaytime: true, temperature: 90, shortForecast: "Sunny" }]),
        now,
      ),
    ).toBeNull();
  });

  it("ignores nighttime periods on tomorrow's date", () => {
    const wx = tomorrowDaytimeForecast(
      daily([{ startTime: "2026-07-09T20:00:00-04:00", isDaytime: false, temperature: 70, shortForecast: "Clear" }]),
      now,
    );
    expect(wx).toBeNull();
  });
});
