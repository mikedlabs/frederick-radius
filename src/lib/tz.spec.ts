import { describe, expect, it, vi } from "vitest";
import { easternDayKey, easternParts, easternWallToUtcISO } from "./tz";

const INSTANTS = [
  { iso: "2026-01-01T04:59:59.999Z", date: "2025-12-31", parts: { year: 2025, month: 12, day: 31, hour: 23, weekday: 3 } },
  { iso: "2026-01-01T05:00:00.000Z", date: "2026-01-01", parts: { year: 2026, month: 1, day: 1, hour: 0, weekday: 4 } },
  { iso: "2026-07-05T03:59:59.999Z", date: "2026-07-04", parts: { year: 2026, month: 7, day: 4, hour: 23, weekday: 6 } },
  { iso: "2026-07-05T04:00:00.000Z", date: "2026-07-05", parts: { year: 2026, month: 7, day: 5, hour: 0, weekday: 0 } },
  { iso: "2026-03-08T06:59:59.999Z", date: "2026-03-08", parts: { year: 2026, month: 3, day: 8, hour: 1, weekday: 0 } },
  { iso: "2026-03-08T07:00:00.000Z", date: "2026-03-08", parts: { year: 2026, month: 3, day: 8, hour: 3, weekday: 0 } },
  { iso: "2026-11-01T05:59:59.999Z", date: "2026-11-01", parts: { year: 2026, month: 11, day: 1, hour: 1, weekday: 0 } },
  { iso: "2026-11-01T06:00:00.000Z", date: "2026-11-01", parts: { year: 2026, month: 11, day: 1, hour: 1, weekday: 0 } },
  { iso: "2026-11-01T07:00:00.000Z", date: "2026-11-01", parts: { year: 2026, month: 11, day: 1, hour: 2, weekday: 0 } },
  { iso: "2028-03-01T04:59:59.999Z", date: "2028-02-29", parts: { year: 2028, month: 2, day: 29, hour: 23, weekday: 2 } },
];

describe("Eastern timezone formatting", () => {
  it.each(INSTANTS)("reads the Eastern date and wall clock at $iso", ({ iso, date, parts }) => {
    const instant = new Date(iso);
    expect(easternDayKey(instant)).toBe(date);
    expect(easternParts(instant)).toEqual(parts);
  });

  it.each([
    { wall: [2026, 3, 7, 12, 0] as const, utc: "2026-03-07T17:00:00.000Z" },
    { wall: [2026, 3, 8, 12, 0] as const, utc: "2026-03-08T16:00:00.000Z" },
    { wall: [2026, 10, 31, 12, 0] as const, utc: "2026-10-31T16:00:00.000Z" },
    { wall: [2026, 11, 1, 12, 0] as const, utc: "2026-11-01T17:00:00.000Z" },
    { wall: [2026, 7, 4, 0, 0] as const, utc: "2026-07-04T04:00:00.000Z" },
    { wall: [2027, 1, 1, 0, 0] as const, utc: "2027-01-01T05:00:00.000Z" },
  ])("converts Eastern wall time $wall with the date's offset", ({ wall, utc }) => {
    expect(easternWallToUtcISO(...wall)).toBe(utc);
  });

  it("retains seconds across an Eastern year boundary", () => {
    expect(easternWallToUtcISO(2026, 12, 31, 23, 59, 58)).toBe("2027-01-01T04:59:58.000Z");
  });

  it("formats a changed Date's current value rather than an earlier result", () => {
    const date = new Date(INSTANTS[0].iso);
    expect(easternDayKey(date)).toBe("2025-12-31");
    date.setTime(Date.parse(INSTANTS[3].iso));
    expect(easternDayKey(date)).toBe("2026-07-05");
    expect(easternParts(date)).toEqual(INSTANTS[3].parts);
    date.setTime(Date.parse(INSTANTS[0].iso));
    expect(easternParts(date)).toEqual(INSTANTS[0].parts);
  });

  it("continues to reject invalid instants and wall-time inputs", () => {
    expect(() => easternDayKey(new Date(Number.NaN))).toThrow(RangeError);
    expect(() => easternParts(new Date(Number.NaN))).toThrow(RangeError);
    expect(() => easternWallToUtcISO(Number.NaN, 1, 1, 0, 0)).toThrow(RangeError);
  });

  it("does not allocate ICU formatters for successive date lookups", () => {
    const constructor = vi.spyOn(Intl, "DateTimeFormat");
    try {
      for (const { iso, date, parts } of [...INSTANTS, ...INSTANTS.toReversed()]) {
        const instant = new Date(iso);
        expect(easternDayKey(instant)).toBe(date);
        expect(easternParts(instant)).toEqual(parts);
        easternWallToUtcISO(parts.year, parts.month, parts.day, 12, 0);
      }
      expect(constructor).not.toHaveBeenCalled();
    } finally {
      constructor.mockRestore();
    }
  });
});
