import { describe, it, expect } from "vitest";
import { horizonOf, groupByHorizon, buildHorizonBounds, type HorizonBounds } from "@/lib/eventHorizon";
import { easternParts } from "@/lib/tz";

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
  it("flags a STARTED feed-live event and currently-running events as live", () => {
    // The feed-live set overrides an unreliable/missing END, but the event must
    // have actually STARTED — a future occurrence mis-flagged live (e.g. an
    // upstream feed mis-dated it) is NOT "happening now".
    expect(horizonOf(ev("concert-live", -HOUR, 0), bounds)).toBe("live"); // started, in live set, degenerate end
    expect(horizonOf(ev("running", -HOUR, 3 * HOUR), bounds)).toBe("live");
    expect(horizonOf(ev("concert-live", 5 * DAY), bounds)).not.toBe("live"); // future → never live
  });

  it("buckets today, weekend, this-week, and later", () => {
    expect(horizonOf(ev("tonight", 6 * HOUR), bounds)).toBe("today");
    expect(horizonOf(ev("sat", 2 * DAY), bounds)).toBe("weekend"); // Sat
    // On Thursday, next Wednesday is after the upcoming weekend. Calling it
    // "Later this week" would put a later date before the weekend shelf.
    expect(horizonOf(ev("nextwed", 6 * DAY), bounds)).toBe("later");
    expect(horizonOf(ev("nextmonth", 30 * DAY), bounds)).toBe("later");
  });

  it("drops past, non-live events", () => {
    expect(horizonOf(ev("over", -2 * DAY), bounds)).toBe(null);
  });
  it("an all-day event TODAY reads as today, never live (the 3 AM Senior Yoga bug)", () => {
    // Started at midnight, spans the whole day: the old gate kept it in
    // "Happening now" through the middle of the night.
    expect(horizonOf({ ...ev("allday", -12 * HOUR, 24 * HOUR), is_all_day: true }, bounds)).toBe("today");
  });

  it("an all-day event whose day has passed is gone", () => {
    expect(horizonOf({ ...ev("allday-past", -30 * HOUR, 20 * HOUR), is_all_day: true }, bounds)).toBe(null);
  });

  it("a FUTURE all-day event still lands in its dated bucket", () => {
    expect(horizonOf({ ...ev("allday-sat", 2 * DAY, 24 * HOUR), is_all_day: true }, bounds)).toBe("weekend");
  });

});

describe("groupByHorizon", () => {
  it("returns ordered, non-empty groups; every surfaced event placed once", () => {
    const events = [
      ev("nextmonth", 30 * DAY),
      ev("tonight", 5 * HOUR),
      ev("concert-live", -HOUR, 0), // started + in live set → the "live" group
      ev("sat", 2 * DAY),
      ev("over", -3 * DAY),
      ev("nextwed", 6 * DAY),
    ];
    const groups = groupByHorizon(events, bounds);
    expect(groups.map((g) => g.key)).toEqual([
      "live",
      "today",
      "weekend",
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

describe("buildHorizonBounds — weekend window contains today on Fri/Sat/Sun", () => {
  // Walk 14 consecutive June 2026 days at ~noon Eastern (EDT = UTC-4, so
  // 16:00Z). June has no DST change, so the window math is clean.
  const noonET = (dayOfMonth: number) => new Date(Date.UTC(2026, 5, dayOfMonth, 16, 0));

  it("always returns a Fri 17:00 → Mon 00:00 ET window", () => {
    for (let i = 1; i <= 14; i++) {
      const b = buildHorizonBounds(noonET(i));
      const s = easternParts(new Date(b.weekendStart));
      const e = easternParts(new Date(b.weekendEnd));
      expect(s.weekday).toBe(5); // Friday
      expect(s.hour).toBe(17); // 5pm
      expect(e.weekday).toBe(1); // Monday
      expect(e.hour).toBe(0); // midnight
      expect(b.weekendEnd - b.weekendStart).toBe(55 * 3_600_000); // Fri 5pm → Mon 0:00
    }
  });

  it("on Sat/Sun the window already started (the next-weekend bug guard)", () => {
    for (let i = 1; i <= 14; i++) {
      const now = noonET(i);
      const b = buildHorizonBounds(now);
      const wd = easternParts(now).weekday;
      if (wd === 6 || wd === 0) {
        // Sat or Sun: weekendStart is BEHIND now (the old daysToFri math put
        // it a week ahead — this is the regression that must never return).
        expect(b.weekendStart).toBeLessThanOrEqual(b.now);
        expect(b.weekendEnd).toBeGreaterThan(b.now);
      }
    }
  });

  it("on Fri the window starts today; Mon-Thu it points to the upcoming Friday", () => {
    for (let i = 1; i <= 14; i++) {
      const now = noonET(i);
      const b = buildHorizonBounds(now);
      const wd = easternParts(now).weekday;
      if (wd === 5) {
        // Friday noon: window starts later today (Fri 5pm).
        expect(easternParts(new Date(b.weekendStart)).day).toBe(easternParts(now).day);
        expect(b.weekendStart).toBeGreaterThan(b.now);
      } else if (wd >= 1 && wd <= 4) {
        // Mon-Thu: the upcoming Friday, within the next 7 days.
        expect(b.weekendStart).toBeGreaterThan(b.now);
        expect(b.weekendStart).toBeLessThan(b.now + 7 * DAY);
      }
    }
  });

  it("next24 is the next Eastern midnight (end of today, never tomorrow's events)", () => {
    const b = buildHorizonBounds(noonET(3));
    const e = easternParts(new Date(b.next24));
    expect(e.hour).toBe(0);
    expect(b.next24).toBeGreaterThan(b.now);
    expect(b.next24).toBeLessThanOrEqual(b.now + DAY);
  });

  it("passes the live set straight through", () => {
    const live = new Set(["x"]);
    expect(buildHorizonBounds(noonET(3), live).live).toBe(live);
  });
});
