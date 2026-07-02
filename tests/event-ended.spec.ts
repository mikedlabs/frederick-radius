import { describe, it, expect } from "vitest";
import { isEventEnded } from "@/lib/eventWhenLabel";

/**
 * isEventEnded — the time-honesty floor for /today (experience review,
 * Today finding #1: at 7:55 PM the rail led with 2-4 PM library events that
 * had ended hours earlier while a live Keys game sat ninth).
 *
 * Contract:
 *  - a real ends_at (later than the start) is trusted as-is
 *  - missing/equal ends_at grants a 2h assumed runtime
 *  - all-day events end with their Eastern calendar day
 */
describe("isEventEnded", () => {
  // 2026-07-01 is EDT (UTC-4). 2 PM ET = 18:00Z, 8 PM ET = 00:00Z next day.
  const eightPmEt = new Date("2026-07-02T00:00:00Z"); // 8:00 PM July 1 ET

  it("an afternoon event with a real end is ended by evening", () => {
    expect(
      isEventEnded(
        { starts_at: "2026-07-01T18:00:00Z", ends_at: "2026-07-01T20:00:00Z" }, // 2-4 PM ET
        eightPmEt,
      ),
    ).toBe(true);
  });

  it("a live evening event (started, end in the future) is NOT ended", () => {
    expect(
      isEventEnded(
        { starts_at: "2026-07-01T23:00:00Z", ends_at: "2026-07-02T02:00:00Z" }, // 7-10 PM ET
        eightPmEt,
      ),
    ).toBe(false);
  });

  it("a future event tonight is NOT ended", () => {
    expect(
      isEventEnded({ starts_at: "2026-07-02T01:00:00Z", ends_at: "2026-07-02T03:00:00Z" }, eightPmEt),
    ).toBe(false);
  });

  it("no-duration events get a 2h assumed runtime, not instant death", () => {
    const sevenPm = { starts_at: "2026-07-01T23:00:00Z", ends_at: "2026-07-01T23:00:00Z" };
    expect(isEventEnded(sevenPm, eightPmEt)).toBe(false); // 8 PM: within grace
    expect(isEventEnded(sevenPm, new Date("2026-07-02T01:30:00Z"))).toBe(true); // 9:30 PM: past it
  });

  it("missing ends_at behaves like no-duration", () => {
    expect(isEventEnded({ starts_at: "2026-07-01T23:00:00Z" }, eightPmEt)).toBe(false);
  });

  it("an all-day event is NOT ended during its own Eastern day", () => {
    expect(
      isEventEnded(
        { starts_at: "2026-07-01T04:00:00Z", ends_at: "2026-07-01T04:00:00Z", is_all_day: true }, // midnight ET July 1
        eightPmEt,
      ),
    ).toBe(false);
  });

  it("an all-day event IS ended the next Eastern day", () => {
    expect(
      isEventEnded(
        { starts_at: "2026-07-01T04:00:00Z", is_all_day: true },
        new Date("2026-07-02T12:00:00Z"), // 8 AM July 2 ET
      ),
    ).toBe(true);
  });

  it("a bad ends_at (unparseable) falls back to the assumed runtime", () => {
    expect(
      isEventEnded({ starts_at: "2026-07-01T23:00:00Z", ends_at: "not a date" }, eightPmEt),
    ).toBe(false);
  });
});
