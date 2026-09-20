import { describe, it, expect } from "vitest";
import { EVENT_BY_SLUG } from "@/data/events";
import { isEventLiveNow } from "./eventWhenLabel";
import {
  groupByHorizon,
  horizonOf,
  isEventListingEnded,
  isRangeListing,
  RANGE_LISTING_STALE_AFTER_MS,
  type HorizonBounds,
} from "./eventHorizon";

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

describe("isEventListingEnded — detail-page availability", () => {
  const fair = EVENT_BY_SLUG["great-frederick-fair-2026"];

  it("keeps the current Fair actionable on September 20 without claiming it is live", () => {
    const duringFair = new Date("2026-09-20T12:00:00-04:00");
    expect(isRangeListing(fair)).toBe(true);
    expect(isEventListingEnded(fair, duringFair)).toBe(false);
    expect(isEventLiveNow(fair, duringFair)).toBe(false);
  });

  it("keeps a future range and retires the Fair at its actual closing time", () => {
    expect(isEventListingEnded(fair, new Date("2026-09-17T12:00:00-04:00"))).toBe(false);
    const closing = Date.parse(fair.ends_at);
    expect(isEventListingEnded(fair, new Date(closing - 1))).toBe(false);
    expect(isEventListingEnded(fair, new Date(closing))).toBe(true);
    expect(isEventListingEnded(fair, new Date(closing + DAY))).toBe(true);
  });

  it("retires a stale range after 120 days even when its stated end is ahead", () => {
    const start = NOW - RANGE_LISTING_STALE_AFTER_MS;
    const series = ev("old-series", start, NOW + 60 * DAY);
    expect(isEventListingEnded(series, new Date(NOW))).toBe(false);
    expect(isEventListingEnded(series, new Date(NOW + 1))).toBe(true);
  });

  it("preserves the timed-session cap and all-day exclusive end", () => {
    const timed = ev("inflated-session", NOW - 10 * HOUR, NOW + HOUR);
    expect(isEventListingEnded(timed, new Date(NOW))).toBe(true);
    const allDay = { ...ev("all-day", NOW - 2 * DAY, NOW + DAY), is_all_day: true };
    expect(isEventListingEnded(allDay, new Date(NOW))).toBe(false);
    expect(isEventListingEnded(allDay, new Date(NOW + DAY))).toBe(true);
  });
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

  it("a live-set flag cannot override an unreliable end", () => {
    // Started an hour ago, end mistakenly equals start (degenerate window).
    // Keep it visible under Today, but do not claim it is happening now.
    const started = ev("featured", NOW - HOUR, NOW - HOUR);
    expect(horizonOf(started, bounds(["featured"]))).toBe("today");
  });

  it("keeps a zero-duration feed row under Today for the assumed visibility window", () => {
    const start = NOW - HOUR;
    const zeroDuration = ev("brunch", start, start);
    expect(horizonOf(zeroDuration, bounds())).toBe("today");
    expect(
      horizonOf(zeroDuration, { ...bounds(), now: start + 2 * HOUR + 1 }),
    ).toBeNull();
  });

  it("keeps an end-of-day sentinel under Today without promoting it live", () => {
    const sentinel = {
      slug: "exercise",
      starts_at: "2026-07-01T09:15:00-04:00",
      ends_at: "2026-07-01T23:59:00-04:00",
    };
    expect(horizonOf(sentinel, bounds(["exercise"]))).toBe("today");
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

describe("groupByHorizon — chronological section order", () => {
  it("puts weekday events before the upcoming weekend", () => {
    const weekdayBounds = bounds();
    const groups = groupByHorizon([
      ev("saturday", weekdayBounds.weekendStart + HOUR, weekdayBounds.weekendStart + 2 * HOUR),
      ev("thursday", NOW + DAY, NOW + DAY + HOUR),
    ], weekdayBounds);

    expect(groups.map((group) => group.key)).toEqual(["week", "weekend"]);
  });

  it("does not fold dates after the upcoming weekend back into Later this week", () => {
    const weekdayBounds = bounds();
    expect(
      horizonOf(
        ev("next-monday", weekdayBounds.weekendEnd + HOUR, weekdayBounds.weekendEnd + 2 * HOUR),
        weekdayBounds,
      ),
    ).toBe("later");
  });

  it("keeps the current weekend ahead of next-week events", () => {
    const weekendBounds: HorizonBounds = {
      now: NOW,
      next24: NOW + 10 * HOUR,
      weekendStart: NOW - HOUR,
      weekendEnd: NOW + 2 * DAY,
      live: new Set(),
    };
    const groups = groupByHorizon([
      ev("monday", weekendBounds.weekendEnd + HOUR, weekendBounds.weekendEnd + 2 * HOUR),
      ev("sunday", NOW + DAY, NOW + DAY + HOUR),
    ], weekendBounds);

    expect(groups.map((group) => group.key)).toEqual(["weekend", "week"]);
    expect(groups.map((group) => group.label)).toEqual(["This weekend", "Next week"]);
  });
});
