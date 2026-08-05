import { describe, expect, it } from "vitest";
import { easternMoment, smartMapDefault, type SmartMapSignals } from "./smartDefaults";

const quiet: SmartMapSignals = {
  activeWeatherAlert: false,
  musicTonightCount: 0,
  parkingCount: 0,
  marketsOpenTodayCount: 0,
  roadsTrendingLongerCount: 0,
};

describe("smartMapDefault", () => {
  it("puts the radar on during an active weather alert, above everything", () => {
    const out = smartMapDefault(
      { hour: 19, weekday: 5 },
      { ...quiet, activeWeatherAlert: true, musicTonightCount: 8 },
    );
    expect(out?.layers).toEqual(["radar"]);
  });

  it("leads Friday evening with tonight's music and the parking answer", () => {
    const out = smartMapDefault(
      { hour: 18, weekday: 5 },
      { ...quiet, musicTonightCount: 6, parkingCount: 5 },
    );
    expect(out?.layers).toEqual(["music-tonight", "parking"]);
  });

  it("never suggests music on a night with no shows", () => {
    expect(smartMapDefault({ hour: 19, weekday: 6 }, quiet)).toBeNull();
  });

  it("leads a Saturday morning with an actually-open market", () => {
    const out = smartMapDefault(
      { hour: 9, weekday: 6 },
      { ...quiet, marketsOpenTodayCount: 2 },
    );
    expect(out?.layers).toEqual(["markets"]);
  });

  it("shows roads at commute time only when a corridor is actually worse", () => {
    expect(
      smartMapDefault({ hour: 8, weekday: 2 }, quiet),
    ).toBeNull();
    const out = smartMapDefault(
      { hour: 8, weekday: 2 },
      { ...quiet, roadsTrendingLongerCount: 1 },
    );
    expect(out?.layers).toEqual(["roads-now"]);
  });

  it("gives a quiet Tuesday afternoon the clean county", () => {
    expect(smartMapDefault({ hour: 14, weekday: 2 }, quiet)).toBeNull();
  });

  it("always names its reason in a complete sentence", () => {
    const out = smartMapDefault(
      { hour: 18, weekday: 5 },
      { ...quiet, musicTonightCount: 3 },
    );
    expect(out?.reason).toMatch(/^[A-Z].*\.$/);
  });
});

describe("easternMoment", () => {
  it("reads the Eastern wall clock, not UTC", () => {
    // 2026-08-05T02:00Z is 10 PM Eastern on Tuesday Aug 4 (EDT).
    const m = easternMoment(new Date("2026-08-05T02:00:00.000Z"));
    expect(m.hour).toBe(22);
    expect(m.weekday).toBe(2);
  });
});
