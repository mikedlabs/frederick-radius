import { describe, it, expect } from "vitest";
import { horizonOf, type HorizonBounds } from "./eventHorizon";

const NOW = Date.parse("2026-07-01T14:00:00Z"); // ~10 AM ET
const HOUR = 3600_000;
const DAY = 24 * HOUR;

function bounds(live: string[] = []): HorizonBounds {
  return {
    now: NOW,
    next24: NOW + 14 * HOUR, // rest of today
    weekendStart: NOW + 2 * DAY,
    weekendEnd: NOW + 5 * DAY,
    live: new Set(live),
  };
}

const ev = (slug: string, startMs: number, endMs: number) => ({
  slug,
  starts_at: new Date(startMs).toISOString(),
  ends_at: new Date(endMs).toISOString(),
});

describe("horizonOf — live gate", () => {
  it("marks a genuinely in-progress event live", () => {
    expect(horizonOf(ev("now", NOW - HOUR, NOW + HOUR), bounds())).toBe("live");
  });

  it("never marks a FAR-FUTURE event live, even if the live-set names it", () => {
    // The bug: an upstream feed mis-dated 'trivia' to ~4 months out, yet a
    // stale/curated live-set forced it "Happening now". A future start must win.
    const future = ev("trivia", NOW + 118 * DAY, NOW + 118 * DAY + 2 * HOUR);
    expect(horizonOf(future, bounds(["trivia"]))).not.toBe("live");
    expect(horizonOf(future, bounds(["trivia"]))).toBe("later");
  });

  it("live-set still overrides a started event whose end is unreliable/past", () => {
    // Started an hour ago, end mistakenly equals start (degenerate window);
    // the live-set keeps it live because it HAS started.
    const started = ev("featured", NOW - HOUR, NOW - HOUR);
    expect(horizonOf(started, bounds(["featured"]))).toBe("live");
  });

  it("a not-yet-started event today is 'today', not live", () => {
    expect(horizonOf(ev("soon", NOW + 3 * HOUR, NOW + 5 * HOUR), bounds())).toBe("today");
  });
});
