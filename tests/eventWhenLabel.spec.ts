import { describe, it, expect } from "vitest";
import { eventWhenLabel, isEventToday } from "@/lib/eventWhenLabel";

// Now = Monday June 15 2026, 7:00 PM Eastern (EDT, UTC-4).
const now = new Date("2026-06-15T19:00:00-04:00");
const todayEvt = "2026-06-15T20:00:00-04:00"; // Mon 8 PM
const tomorrowEvt = "2026-06-16T19:00:00-04:00"; // Tue
const wedEvt = "2026-06-17T19:00:00-04:00"; // Wed

describe("eventWhenLabel — honest 'when' (no false Tonight)", () => {
  it("labels a same-day event 'Tonight' in the evening band", () => {
    expect(eventWhenLabel(todayEvt, now, true)).toBe("Tonight");
  });
  it("labels a same-day event 'Today' in a daytime band", () => {
    expect(eventWhenLabel(todayEvt, now, false)).toBe("Today");
  });
  it("labels a next-day event 'Tomorrow' even in the evening band", () => {
    expect(eventWhenLabel(tomorrowEvt, now, true)).toBe("Tomorrow");
  });
  it("labels a 2-3 day-out event by weekday — never 'Tonight' (the Jason Hannan bug)", () => {
    expect(eventWhenLabel(wedEvt, now, true)).toBe("Wednesday");
  });
});

describe("isEventToday", () => {
  it("is true only for the same Eastern calendar day", () => {
    expect(isEventToday(todayEvt, now)).toBe(true);
    expect(isEventToday(tomorrowEvt, now)).toBe(false);
    expect(isEventToday(wedEvt, now)).toBe(false);
  });
});
