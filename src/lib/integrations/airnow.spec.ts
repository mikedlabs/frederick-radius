import { describe, expect, it } from "vitest";
import type { AqiObservation } from "./airnow";
import { airQualityObservedAt, isFreshAqiObservation } from "./airnow";

function observation(dateObserved: string, hourObserved: number): AqiObservation {
  return {
    parameter: "PM2.5",
    aqi: 42,
    category: { id: 1, name: "Good", color: "#1E6B3A" },
    reportingArea: "Frederick",
    dateObserved,
    hourObserved,
  };
}

describe("AirNow observation freshness", () => {
  it("parses AirNow's ISO and slash date shapes as Eastern wall time", () => {
    expect(airQualityObservedAt(observation("2026-07-17", 12))?.toISOString())
      .toBe("2026-07-17T16:00:00.000Z");
    expect(airQualityObservedAt(observation("07/17/2026", 12))?.toISOString())
      .toBe("2026-07-17T16:00:00.000Z");
  });

  it("accepts an hourly reading within three hours", () => {
    expect(isFreshAqiObservation(
      observation("2026-07-17", 12),
      new Date("2026-07-17T18:59:00.000Z"),
    )).toBe(true);
  });

  it("rejects stale, malformed, and implausibly future readings", () => {
    const now = new Date("2026-07-17T20:01:00.000Z");
    expect(isFreshAqiObservation(observation("2026-07-17", 12), now)).toBe(false);
    expect(isFreshAqiObservation(observation("not-a-date", 12), now)).toBe(false);
    expect(isFreshAqiObservation(
      observation("2026-07-17", 18),
      new Date("2026-07-17T20:00:00.000Z"),
    )).toBe(false);
  });
});
