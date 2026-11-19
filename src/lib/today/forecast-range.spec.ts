import { describe, expect, it } from "vitest";
import { todayForecastRange } from "./forecast-range";

function period(startTime: string, endTime: string, temperature: number, isDaytime: boolean, temperatureUnit: "F" | "C" = "F") {
  return { startTime, endTime, temperature, isDaytime, temperatureUnit };
}

describe("Frederick's daytime high and overnight low", () => {
  const periods = [
    period("2026-03-08T01:00:00-05:00", "2026-03-08T06:00:00-04:00", 28, false),
    period("2026-03-08T06:00:00-04:00", "2026-03-08T18:00:00-04:00", 10, true, "C"),
    period("2026-03-08T18:00:00-04:00", "2026-03-09T06:00:00-04:00", 0, false),
    period("2026-03-09T06:00:00-04:00", "2026-03-09T18:00:00-04:00", 65, true),
  ];
  it("keeps tonight's low distinct from last night's low across the DST transition", () => {
    expect(todayForecastRange(periods, new Date("2026-03-08T06:30:00Z"))).toEqual({ highF: 50, lowF: 0 });
  });
  it("uses Frederick's calendar day after UTC midnight and never borrows tomorrow's high", () => {
    expect(todayForecastRange(periods.slice(2), new Date("2026-03-09T02:30:00Z"))).toEqual({ highF: null, lowF: 0 });
  });
  it("leaves missing, invalid and undated temperatures unknown", () => {
    const invalid = [period("invalid", "invalid", 10, true), { ...periods[1], temperature: NaN }];
    expect(todayForecastRange(invalid, new Date("2026-03-08T16:00:00Z"))).toEqual({ highF: null, lowF: null });
  });
});
