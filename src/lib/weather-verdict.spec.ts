import { describe, it, expect } from "vitest";
import { weatherVerdict, type VerdictInput } from "./weather-verdict";

// 2026-07-08, Eastern daylight time (UTC-4).
const DAY = new Date("2026-07-08T16:00:00.000Z"); // 12:00 PM ET
const EVENING = new Date("2026-07-08T23:00:00.000Z"); // 7:00 PM ET
const OVERNIGHT = new Date("2026-07-08T08:18:00.000Z"); // 4:18 AM ET (the audit render)
const LATE = new Date("2026-07-09T03:00:00.000Z"); // 11:00 PM ET

function input(over: Partial<VerdictInput>): VerdictInput {
  return { temp: 72, shortForecast: "Clear", precipNow: 0, hourly: [], now: DAY, ...over };
}

describe("weatherVerdict fog branch (the one moodLine had and this engine lacked)", () => {
  it("reads fog as a mixed gray sky, never a fine day", () => {
    for (const sf of ["Patchy Fog", "Areas Of Mist", "Haze", "Hazy"]) {
      const v = weatherVerdict(input({ shortForecast: sf }));
      expect(v.line).toBe("Low and gray, fog hanging around.");
      expect(v.tone).toBe("mixed");
    }
  });

  it("cannot contradict itself at 4 AM: fog is never 'a fine day'", () => {
    const v = weatherVerdict(input({ shortForecast: "Patchy Fog", now: OVERNIGHT }));
    expect(v.line).not.toMatch(/fine day|good day/i);
    expect(v.tone).toBe("mixed");
  });

  it("storms still outrank fog", () => {
    const v = weatherVerdict(input({ shortForecast: "Fog then Thunderstorms" }));
    expect(v.tone).toBe("rough");
    expect(v.line).toMatch(/storms/i);
  });
});

describe("weatherVerdict overnight band (22:00–05:00)", () => {
  it("never claims daylight in the dark hours", () => {
    for (const now of [OVERNIGHT, LATE]) {
      const v = weatherVerdict(input({ shortForecast: "Isolated Whatever", now }));
      expect(v.line).toBe("A quiet night out there.");
    }
  });

  it("clear overnight reads as a quiet clear night", () => {
    expect(weatherVerdict(input({ now: OVERNIGHT })).line).toBe("Quiet and clear out there.");
  });

  it("cloudy overnight reads as a quiet night, not an easy day to explore", () => {
    const v = weatherVerdict(input({ shortForecast: "Mostly Cloudy", now: OVERNIGHT }));
    expect(v.line).toBe("Quiet night, clouds over the county.");
  });

  it("active rain overnight names the night, not an indoor kind of day", () => {
    const v = weatherVerdict(input({ shortForecast: "Rain Showers", precipNow: 80, now: OVERNIGHT }));
    expect(v.line).toBe("Rain moving through the night.");
    expect(v.tone).toBe("rough");
  });
});

describe("weatherVerdict daytime/evening bands are unchanged", () => {
  it("clear midday reads as a good day to be outside", () => {
    expect(weatherVerdict(input({})).line).toBe("Clear out, a good day to be outside.");
  });

  it("clear 7 PM reads as a patio kind of evening", () => {
    expect(weatherVerdict(input({ now: EVENING })).line).toBe(
      "Clear and easy, a patio kind of evening.",
    );
  });

  it("4 AM is NOT the evening band (the old `hour < 4` tail is gone)", () => {
    const v = weatherVerdict(input({ shortForecast: "Rain Showers", precipNow: 80, now: OVERNIGHT }));
    expect(v.line).not.toMatch(/evening/i);
  });
});

describe("weatherVerdict safety overrides", () => {
  it("never recommends being outside during an active heat advisory", () => {
    const v = weatherVerdict(input({
      temp: 85,
      forecastHigh: 102,
      shortForecast: "Sunny",
      activeAlerts: [{ event: "Heat Advisory", severity: "Moderate" }],
    }));
    expect(v.tone).toBe("rough");
    expect(v.line).toMatch(/dangerous heat/i);
    expect(v.line).not.toMatch(/good day|outside\.$|patio/i);
  });

  it("uses a dangerous forecast high even when the current hour is mild", () => {
    const v = weatherVerdict(input({ temp: 78, forecastHigh: 102, shortForecast: "Clear" }));
    expect(v.tone).toBe("rough");
    expect(v.line).toMatch(/dangerous heat later/i);
  });

  it("suppresses cheerful copy for any active weather alert", () => {
    const v = weatherVerdict(input({
      shortForecast: "Clear",
      activeAlerts: [{ event: "Flood Watch", severity: "Moderate" }],
    }));
    expect(v.tone).toBe("mixed");
    expect(v.line).toMatch(/Flood Watch active/);
    expect(v.line).not.toMatch(/good day|patio|easy day/i);
  });
});
