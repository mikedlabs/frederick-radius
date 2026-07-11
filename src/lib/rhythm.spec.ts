import { describe, expect, it } from "vitest";
import { packWeek, isOpenAt, slotLabel, SLOTS_PER_DAY, WEEK_SLOTS } from "./rhythm";

const at = (day: number, h: number, m = 0) => day * SLOTS_PER_DAY + h * 4 + Math.floor(m / 15);

describe("packWeek", () => {
  it("lights exactly the posted window", () => {
    const mask = packWeek({ wed: [{ open: "09:00", close: "17:00" }] });
    expect(isOpenAt(mask, 0, at(2, 8, 45))).toBe(false);
    expect(isOpenAt(mask, 0, at(2, 9, 0))).toBe(true);
    expect(isOpenAt(mask, 0, at(2, 16, 45))).toBe(true);
    expect(isOpenAt(mask, 0, at(2, 17, 0))).toBe(false);
    // Other days stay dark.
    expect(isOpenAt(mask, 0, at(3, 12, 0))).toBe(false);
  });

  it("wraps a past-midnight close into the next day's early slots", () => {
    // Friday 8 PM to 2 AM: Saturday 1:45 lit, Saturday 2:00 dark.
    const mask = packWeek({ fri: [{ open: "20:00", close: "02:00" }] });
    expect(isOpenAt(mask, 0, at(4, 23, 45))).toBe(true);
    expect(isOpenAt(mask, 0, at(5, 1, 45))).toBe(true);
    expect(isOpenAt(mask, 0, at(5, 2, 0))).toBe(false);
  });

  it("treats open == close as all day (24h listings)", () => {
    const mask = packWeek({ mon: [{ open: "00:00", close: "00:00" }] });
    expect(isOpenAt(mask, 0, at(0, 0, 0))).toBe(true);
    expect(isOpenAt(mask, 0, at(0, 23, 45))).toBe(true);
    expect(isOpenAt(mask, 0, at(1, 0, 0))).toBe(false);
  });

  it("packs a full week into 84 bytes", () => {
    expect(packWeek({}).length).toBe(WEEK_SLOTS / 8);
  });
});

describe("slotLabel", () => {
  it("names the slot in Eastern wall words", () => {
    expect(slotLabel(at(2, 13, 0))).toBe("Wednesday · 1:00 PM");
    expect(slotLabel(at(0, 0, 15))).toBe("Monday · 12:15 AM");
    expect(slotLabel(at(6, 12, 0))).toBe("Sunday · 12:00 PM");
  });
});
