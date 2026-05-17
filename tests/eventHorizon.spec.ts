import { describe, it, expect } from "vitest";
import { horizonOf, groupByHorizon, type HorizonBounds } from "@/lib/eventHorizon";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Fixed clock: "now" = Thu noon. Weekend = Fri 5pm → Mon 0:00.
const now = +new Date("2026-05-21T12:00:00-04:00");
const bounds: HorizonBounds = {
  now,
  next24: now + DAY,
  weekendStart: +new Date("2026-05-22T17:00:00-04:00"),
  weekendEnd: +new Date("2026-05-25T00:00:00-04:00"),
  live: new Set(["concert-live"]),
};

const ev = (slug: string, startsInMs: number, durMs = 2 * HOUR) => ({
  slug,
  starts_at: new Date(now + startsInMs).toISOString(),
  ends_at: new Date(now + startsInMs + durMs).toISOString(),
});

describe("horizonOf", () => {
  it("flags feed-live and currently-running events as live", () => {
    expect(horizonOf(ev("concert-live", 5 * DAY), bounds)).toBe("live");
    expect(horizonOf(ev("running", -HOUR, 3 * HOUR), bounds)).toBe("live");
  });

  it("buckets today, weekend, this-week, and later", () => {
    expect(horizonOf(ev("tonight", 6 * HOUR), bounds)).toBe("today");
    expect(horizonOf(ev("sat", 2 * DAY), bounds)).toBe("weekend"); // Sat
    expect(horizonOf(ev("nextwed", 6 * DAY), bounds)).toBe("week");
    expect(horizonOf(ev("nextmonth", 30 * DAY), bounds)).toBe("later");
  });

  it("drops past, non-live events", () => {
    expect(horizonOf(ev("over", -2 * DAY), bounds)).toBe(null);
  });
});

describe("groupByHorizon", () => {
  it("returns ordered, non-empty groups; every surfaced event placed once", () => {
    const events = [
      ev("nextmonth", 30 * DAY),
      ev("tonight", 5 * HOUR),
      ev("concert-live", 5 * DAY),
      ev("sat", 2 * DAY),
      ev("over", -3 * DAY),
      ev("nextwed", 6 * DAY),
    ];
    const groups = groupByHorizon(events, bounds);
    expect(groups.map((g) => g.key)).toEqual([
      "live",
      "today",
      "weekend",
      "week",
      "later",
    ]);
    const total = groups.reduce((n, g) => n + g.events.length, 0);
    expect(total).toBe(events.length - 1); // "over" dropped
    expect(groups[0].label).toBe("Happening now");
  });

  it("omits empty horizons", () => {
    const groups = groupByHorizon([ev("tonight", 3 * HOUR)], bounds);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("today");
  });
});
