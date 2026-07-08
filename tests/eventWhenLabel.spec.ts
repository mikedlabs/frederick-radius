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

// ── isEventLiveNow — the shared "Live now" gate (beta-reviewer catch:
// noon events with end-of-day end stamps read "Live now" at 11 PM) ──
import { isEventLiveNow, MAX_LIVE_SESSION_MS } from "@/lib/eventWhenLabel";

describe("isEventLiveNow", () => {
  const at = (iso: string) => new Date(iso);

  it("caps a stated end-of-day end: noon event is NOT live at 11 PM", () => {
    const e = { starts_at: "2026-07-08T12:00:00-04:00", ends_at: "2026-07-08T23:59:00-04:00" };
    expect(isEventLiveNow(e, at("2026-07-08T23:00:00-04:00"))).toBe(false);
    // …but it IS live mid-afternoon, inside the cap.
    expect(isEventLiveNow(e, at("2026-07-08T15:00:00-04:00"))).toBe(true);
  });

  it("trusts a sane stated end as-is", () => {
    const e = { starts_at: "2026-07-08T19:00:00-04:00", ends_at: "2026-07-08T22:00:00-04:00" };
    expect(isEventLiveNow(e, at("2026-07-08T21:30:00-04:00"))).toBe(true);
    expect(isEventLiveNow(e, at("2026-07-08T22:01:00-04:00"))).toBe(false);
  });

  it("grants the assumed runtime when the end is missing", () => {
    const e = { starts_at: "2026-07-08T19:00:00-04:00" };
    expect(isEventLiveNow(e, at("2026-07-08T20:00:00-04:00"))).toBe(true);
    expect(isEventLiveNow(e, at("2026-07-08T21:01:00-04:00"))).toBe(false);
  });

  it("never marks all-day rows live (they are 'today', not 'this minute')", () => {
    const e = { starts_at: "2026-07-08T00:00:00-04:00", ends_at: "2026-07-08T23:59:00-04:00", is_all_day: true };
    expect(isEventLiveNow(e, at("2026-07-08T15:00:00-04:00"))).toBe(false);
  });

  it("a multi-day range listing dies at the session cap, not its range end", () => {
    const e = { starts_at: "2026-07-01T10:00:00-04:00", ends_at: "2026-07-20T18:00:00-04:00" };
    expect(isEventLiveNow(e, at("2026-07-10T14:00:00-04:00"))).toBe(false);
    // opening hours of day one, inside the cap: honest to call running.
    expect(isEventLiveNow(e, at("2026-07-01T12:00:00-04:00"))).toBe(true);
  });

  it("a future start is never live", () => {
    const e = { starts_at: "2026-07-08T19:00:00-04:00", ends_at: "2026-07-08T22:00:00-04:00" };
    expect(isEventLiveNow(e, at("2026-07-08T18:59:00-04:00"))).toBe(false);
  });

  it("cap constant stays a real single-session bound", () => {
    expect(MAX_LIVE_SESSION_MS).toBe(8 * 3_600_000);
  });
});
