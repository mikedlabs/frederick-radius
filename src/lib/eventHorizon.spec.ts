import { describe, it, expect } from "vitest";
import { horizonOf, isRangeListing, type HorizonBounds } from "./eventHorizon";

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

  it("keeps a zero-duration feed row live for the assumed two-hour runtime", () => {
    const start = NOW - HOUR;
    const zeroDuration = ev("brunch", start, start);
    expect(horizonOf(zeroDuration, bounds())).toBe("live");
    expect(
      horizonOf(zeroDuration, { ...bounds(), now: start + 2 * HOUR + 1 }),
    ).toBeNull();
  });

  it("a not-yet-started event today is 'today', not live", () => {
    expect(horizonOf(ev("soon", NOW + 3 * HOUR, NOW + 5 * HOUR), bounds())).toBe("today");
  });
});

describe("horizonOf — date-range listings (isRangeListing)", () => {
  // The Jul-2 owner report: Visit Frederick models a weekly series / a
  // months-long exhibit as ONE first-day → last-day window, so "started AND
  // not ended" held for the whole span and 18 of them squatted in
  // "Happening now" wearing their first-day date (one since Oct 2022).

  it("an in-progress multi-month range files under 'later', never live", () => {
    const exhibit = ev("exhibit", NOW - 120 * DAY, NOW + 90 * DAY);
    expect(horizonOf(exhibit, bounds())).toBe("later");
  });

  it("retires a years-old flattened series even when the curated live-set names it", () => {
    const series = ev("trivia", NOW - 500 * DAY, NOW + 180 * DAY);
    expect(horizonOf(series, bounds(["trivia"]))).toBeNull();
  });

  it("retires an ongoing range after its opening is more than four months old", () => {
    const stale = ev("old-series", NOW - 121 * DAY, NOW + 30 * DAY);
    expect(horizonOf(stale, bounds())).toBeNull();
  });

  it("an ENDED range drops (null), like any past event", () => {
    expect(horizonOf(ev("over", NOW - 90 * DAY, NOW - DAY), bounds())).toBeNull();
  });

  it("a range OPENING today earns 'today' — opening day is a real date claim", () => {
    const opening = ev("opening", NOW + 2 * HOUR, NOW + 60 * DAY);
    expect(horizonOf(opening, bounds())).toBe("today");
  });

  it("a range opening far out files under 'later' by its opening day", () => {
    const future = ev("fair", NOW + 30 * DAY, NOW + 40 * DAY);
    expect(horizonOf(future, bounds())).toBe("later");
  });

  it("a genuine overnight single event (< 36h) still reads live while running", () => {
    const overnight = ev("overnight", NOW - 2 * HOUR, NOW + 20 * HOUR);
    expect(horizonOf(overnight, bounds())).toBe("live");
  });

  it("isRangeListing: >36h non-all-day only; all-day rows keep all-day semantics", () => {
    expect(isRangeListing(ev("x", NOW, NOW + 2 * DAY))).toBe(true);
    expect(isRangeListing(ev("x", NOW, NOW + HOUR))).toBe(false);
    expect(isRangeListing({ ...ev("x", NOW, NOW + 2 * DAY), is_all_day: true })).toBe(false);
  });
});

describe("horizonOf — started but past the live cap", () => {
  const NOW = Date.parse("2026-07-09T21:47:00-04:00"); // 9:47 PM ET
  const bounds = {
    now: NOW,
    next24: NOW + 24 * 3_600_000,
    weekendStart: NOW + 24 * 3_600_000,
    weekendEnd: NOW + 72 * 3_600_000,
    live: new Set<string>(),
  };

  it("drops a noon event with an end-of-day stamp at night (not live, not upcoming)", () => {
    // Started 12:00 PM, feed stamped the end at 11:59 PM: at 9:47 PM the
    // live-session cap has long expired, and "Coming up" must not lead
    // with it.
    expect(
      horizonOf(
        {
          slug: "anniversary",
          starts_at: "2026-07-09T12:00:00-04:00",
          ends_at: "2026-07-09T23:59:00-04:00",
        },
        bounds,
      ),
    ).toBeNull();
  });

  it("keeps a genuinely live evening event", () => {
    expect(
      horizonOf(
        {
          slug: "show",
          starts_at: "2026-07-09T21:00:00-04:00",
          ends_at: "2026-07-09T23:00:00-04:00",
        },
        bounds,
      ),
    ).toBe("live");
  });
});
