import { describe, it, expect } from "vitest";
import { parseHappyHour, happyHourStatus } from "./happyHour";

// Fixed instants, expressed with the Eastern offset (EDT in July) so the
// assertions read as the wall-clock times they test.
const mon4pm = new Date("2026-07-06T16:00:00-04:00");
const mon8pm = new Date("2026-07-06T20:00:00-04:00");
const mon11am = new Date("2026-07-06T11:00:00-04:00");
const thu11am = new Date("2026-07-09T11:00:00-04:00");
const wed4pm = new Date("2026-07-08T16:00:00-04:00");
const wed8pm = new Date("2026-07-08T20:00:00-04:00");

describe("parseHappyHour parenthetical exceptions (the Bentztown schedule)", () => {
  // The real Bentztown string. Parsed as ONE clause, the "(… all day
  // Thursday)" exception used to widen the Sun-Fri 3-6 window to all-day
  // on EVERY listed day.
  const bentztown = "Sun-Fri 3-6 PM (plus half-price wine bottles all day Thursday)";

  it("keeps the explicit 3-6 PM window on Sun-Fri", () => {
    const windows = parseHappyHour(bentztown);
    expect(windows).toContainEqual({
      days: [0, 1, 2, 3, 4, 5],
      start: 15 * 60,
      end: 18 * 60,
    });
  });

  it("adds an all-day window on Thursday ONLY", () => {
    const windows = parseHappyHour(bentztown);
    expect(windows).toContainEqual({ days: [4], start: 0, end: 1440 });
    // No other all-day window leaked onto the Sun-Fri days.
    const allDay = windows.filter((w) => w.start === 0 && w.end === 1440);
    expect(allDay).toHaveLength(1);
  });

  it("is ON at Monday 4 PM, OFF at Monday 8 PM, ON all day Thursday", () => {
    expect(happyHourStatus(bentztown, mon4pm).state).toBe("now");
    expect(happyHourStatus(bentztown, mon8pm).state).not.toBe("now");
    expect(happyHourStatus(bentztown, thu11am).state).toBe("now");
  });

  it("still announces the later-today start before the window", () => {
    expect(happyHourStatus(bentztown, mon11am)).toEqual({
      state: "today",
      startsAt: "3 PM",
    });
  });
});

describe("explicit range beats 'all day' wording in one clause (JoJo's)", () => {
  // The real JoJo's string. The old all-day-first check turned the whole
  // Wed-Sat 3-5 window into all-day, so 8 PM Wednesday claimed "on now".
  const jojos = "Wed-Sat 3-5 PM & all day Sunday (Tap House)";

  it("is ON at Wednesday 4 PM, OFF at Wednesday 8 PM", () => {
    expect(happyHourStatus(jojos, wed4pm).state).toBe("now");
    expect(happyHourStatus(jojos, wed8pm).state).not.toBe("now");
  });

  it("never widens the Wed-Sat window to all-day", () => {
    const windows = parseHappyHour(jojos);
    for (const w of windows.filter((x) => x.days.includes(3))) {
      expect(w.end - w.start).toBeLessThan(1440);
    }
  });
});

describe("plain schedules keep parsing as before", () => {
  it("parses a simple weekday range", () => {
    expect(parseHappyHour("Mon-Fri 3-6 PM")).toEqual([
      { days: [1, 2, 3, 4, 5], start: 15 * 60, end: 18 * 60 },
    ]);
  });

  it("parses a standalone all-day clause (White Rabbit)", () => {
    const windows = parseHappyHour("All day Monday; 3-6pm Tuesday-Friday");
    expect(windows).toContainEqual({ days: [1], start: 0, end: 1440 });
    expect(windows).toContainEqual({
      days: [2, 3, 4, 5],
      start: 15 * 60,
      end: 18 * 60,
    });
  });

  it("returns [] for unparseable text (honest 'unknown', never a wrong badge)", () => {
    expect(parseHappyHour("Daily themed specials")).toEqual([]);
  });
});
