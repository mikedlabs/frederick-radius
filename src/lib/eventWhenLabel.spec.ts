import { describe, it, expect } from "vitest";
import { isEventEnded, isEventLiveNow, MAX_LIVE_SESSION_MS } from "./eventWhenLabel";

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

describe("isEventEnded is the exact complement of isEventLiveNow (started, timed)", () => {
  const e = { starts_at: "2026-07-12T13:00:00-04:00", ends_at: "2026-07-12T23:59:00-04:00" };
  for (const iso of [
    "2026-07-12T14:00:00-04:00", // 2 PM, within cap
    "2026-07-12T20:30:00-04:00", // 8:30 PM, within cap
    "2026-07-12T22:00:00-04:00", // 10 PM, past cap
  ]) {
    it(`no event is both live and ended at ${iso}`, () => {
      const now = at(iso);
      expect(isEventLiveNow(e, now)).toBe(!isEventEnded(e, now));
    });
  }

  it("all-day events are never live-now", () => {
    const today = { starts_at: "2026-07-12T00:00:00-04:00", is_all_day: true };
    expect(isEventLiveNow(today, at("2026-07-12T12:00:00-04:00"))).toBe(false);
  });
});
