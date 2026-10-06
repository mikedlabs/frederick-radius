import { describe, it, expect } from "vitest";
import {
  isEventEnded,
  isEventLiveNow,
  MAX_LIVE_SESSION_MS,
  classifyEventEndTrust,
  eventHasEndOfDaySentinel,
} from "./eventWhenLabel";

// All fixtures are in Eastern Daylight Time (July, -04:00) so the day math is
// unambiguous. The bug these guard: isEventEnded trusted an inflated feed end
// verbatim while isEventLiveNow capped it, so a 1-4 PM show tagged "ends
// 11:59 PM" rode the /today live rail all evening ("Down Time Duo", owner
// catch Jul 2026).

const at = (iso: string) => new Date(iso);
const H = 3_600_000;

describe("isEventEnded — the /today 'is it over?' floor", () => {
  it("caps an inflated end-of-day stamp at MAX_LIVE_SESSION_MS", () => {
    // 1 PM show the feed stamped as ending 11:59 PM.
    const e = { starts_at: "2026-07-12T13:00:00-04:00", ends_at: "2026-07-12T23:59:00-04:00" };
    const start = Date.parse(e.starts_at);
    // Still within the capped session (before start+8h = 9 PM): not ended.
    expect(isEventEnded(e, at("2026-07-12T15:00:00-04:00"))).toBe(false); // 3 PM
    expect(isEventEnded(e, new Date(start + MAX_LIVE_SESSION_MS - H))).toBe(false); // 8 PM
    // Past the cap (after 9 PM): ended, even though the stamp says 11:59 PM.
    // Pre-fix this stayed false until 11:59 PM and lingered on the rail.
    expect(isEventEnded(e, new Date(start + MAX_LIVE_SESSION_MS + H))).toBe(true); // 10 PM
  });

  it("trusts an honest end that is within a plausible session", () => {
    const e = { starts_at: "2026-07-12T13:00:00-04:00", ends_at: "2026-07-12T16:00:00-04:00" };
    expect(isEventEnded(e, at("2026-07-12T14:00:00-04:00"))).toBe(false); // 2 PM, still on
    expect(isEventEnded(e, at("2026-07-12T16:30:00-04:00"))).toBe(true); // 4:30 PM, over
  });

  it("gives a no-end event a 2h grace, then ends it", () => {
    const e = { starts_at: "2026-07-12T19:00:00-04:00" }; // 7 PM, no ends_at
    expect(isEventEnded(e, at("2026-07-12T19:30:00-04:00"))).toBe(false); // 7:30, grace
    expect(isEventEnded(e, at("2026-07-12T21:30:00-04:00"))).toBe(true); // 9:30, past 2h
  });

  it("ends an all-day event only after its Eastern calendar day, never mid-day", () => {
    const today = { starts_at: "2026-07-12T00:00:00-04:00", is_all_day: true };
    expect(isEventEnded(today, at("2026-07-12T22:00:00-04:00"))).toBe(false); // 10 PM same day
    const yesterday = { starts_at: "2026-07-11T00:00:00-04:00", is_all_day: true };
    expect(isEventEnded(yesterday, at("2026-07-12T09:00:00-04:00"))).toBe(true);
  });
});

describe("isEventLiveNow — evidence floor", () => {
  const e = { starts_at: "2026-07-12T13:00:00-04:00", ends_at: "2026-07-12T16:00:00-04:00" };
  for (const iso of [
    "2026-07-12T14:00:00-04:00", // 2 PM, within cap
    "2026-07-12T15:30:00-04:00", // 3:30 PM, before the confirmed end
    "2026-07-12T16:30:00-04:00", // 4:30 PM, after the confirmed end
  ]) {
    it(`a confirmed-end event is never both live and ended at ${iso}`, () => {
      const now = at(iso);
      expect(isEventLiveNow(e, now)).toBe(!isEventEnded(e, now));
    });
  }

  it("keeps an unknown-end event briefly discoverable without calling it live", () => {
    const unknownEnd = { starts_at: "2026-07-12T13:00:00-04:00" };
    const now = at("2026-07-12T14:00:00-04:00");
    expect(isEventEnded(unknownEnd, now)).toBe(false);
    expect(isEventLiveNow(unknownEnd, now)).toBe(false);
  });

  it("does not trust an end-of-day sentinel as a live end", () => {
    const sentinel = {
      starts_at: "2026-07-12T09:15:00-04:00",
      ends_at: "2026-07-12T23:59:00-04:00",
    };
    expect(isEventLiveNow(sentinel, at("2026-07-12T11:00:00-04:00"))).toBe(false);
  });

  it("all-day events are never live-now", () => {
    const today = { starts_at: "2026-07-12T00:00:00-04:00", is_all_day: true };
    expect(isEventLiveNow(today, at("2026-07-12T12:00:00-04:00"))).toBe(false);
  });
});

describe("classifyEventEndTrust — archive hydrate quarantine", () => {
  it("classifies missing ends_at as 'missing'", () => {
    expect(
      classifyEventEndTrust({
        starts_at: "2026-10-06T13:00:00-04:00",
        ends_at: null,
      }),
    ).toBe("missing");

    expect(
      classifyEventEndTrust({
        starts_at: "2026-10-06T13:00:00-04:00",
      }),
    ).toBe("missing");
  });

  it("classifies equal start and end as 'equal'", () => {
    const bingo = {
      starts_at: "2026-10-06T19:00:00-04:00",
      ends_at: "2026-10-06T19:00:00-04:00",
    };
    expect(classifyEventEndTrust(bingo)).toBe("equal");
  });

  it("classifies end-of-day sentinels as 'sentinel'", () => {
    const dailyExercise = {
      starts_at: "2026-10-06T09:15:00-04:00",
      ends_at: "2026-10-06T23:59:00-04:00",
    };
    expect(classifyEventEndTrust(dailyExercise)).toBe("sentinel");
  });

  it("classifies shorter-span end-of-day sentinels as 'sentinel' (4h gate)", () => {
    const tops = {
      starts_at: "2026-10-06T14:00:00-04:00",
      ends_at: "2026-10-06T23:59:00-04:00",
    };
    expect(classifyEventEndTrust(tops)).toBe("sentinel");

    const trivia = {
      starts_at: "2026-10-06T14:30:00-04:00",
      ends_at: "2026-10-06T23:59:00-04:00",
    };
    expect(classifyEventEndTrust(trivia)).toBe("sentinel");
  });

  it("does not classify near-midnight evening events as sentinels", () => {
    const lateShow = {
      starts_at: "2026-10-06T21:00:00-04:00",
      ends_at: "2026-10-06T23:59:00-04:00",
    };
    expect(classifyEventEndTrust(lateShow)).toBe("ok");
  });

  it("classifies 12:59 AM next-day rollover as sentinel (Kid Creator Fall Market)", () => {
    const kidCreator = {
      starts_at: "2026-10-11T16:00:00.000Z",
      ends_at: "2026-10-12T04:59:00.000Z",
    };
    expect(eventHasEndOfDaySentinel(kidCreator)).toBe(true);
    expect(classifyEventEndTrust(kidCreator)).toBe("sentinel");
  });

  it("12:59 AM sentinel is not live mid-afternoon", () => {
    const kidCreator = {
      starts_at: "2026-10-11T16:00:00.000Z",
      ends_at: "2026-10-12T04:59:00.000Z",
    };
    const midAfternoon = at("2026-10-11T18:00:00.000Z");
    expect(isEventLiveNow(kidCreator, midAfternoon)).toBe(false);
  });

  it("classifies multi-week timed spans as 'span'", () => {
    const multiWeekClass = {
      starts_at: "2026-10-06T18:00:00-04:00",
      ends_at: "2026-10-27T20:00:00-04:00",
    };
    expect(classifyEventEndTrust(multiWeekClass)).toBe("span");
  });

  it("classifies normal timed events as 'ok'", () => {
    const normalEvent = {
      starts_at: "2026-10-06T19:00:00-04:00",
      ends_at: "2026-10-06T21:00:00-04:00",
    };
    expect(classifyEventEndTrust(normalEvent)).toBe("ok");
  });

  it("classifies all-day multi-day events as 'ok'", () => {
    const festival = {
      starts_at: "2026-10-06T00:00:00-04:00",
      ends_at: "2026-10-08T23:59:59-04:00",
      is_all_day: true,
    };
    expect(classifyEventEndTrust(festival)).toBe("ok");
  });

  it("classifies invalid date strings as 'missing'", () => {
    expect(
      classifyEventEndTrust({
        starts_at: "invalid",
        ends_at: "2026-10-06T21:00:00-04:00",
      }),
    ).toBe("missing");

    expect(
      classifyEventEndTrust({
        starts_at: "2026-10-06T19:00:00-04:00",
        ends_at: "invalid",
      }),
    ).toBe("missing");
  });

  it("classifies backwards time (end before start) as 'missing'", () => {
    expect(
      classifyEventEndTrust({
        starts_at: "2026-10-06T21:00:00-04:00",
        ends_at: "2026-10-06T19:00:00-04:00",
      }),
    ).toBe("missing");
  });
});
