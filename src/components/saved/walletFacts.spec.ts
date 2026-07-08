import { describe, expect, it } from "vitest";
import {
  distanceLabel,
  fmtClock,
  fmtClockShort,
  lipFact,
  plate,
  priceGlyphs,
  savedDateLabel,
  todayHoursLine,
} from "@/components/saved/walletFacts";
import type { Hours } from "@/data/places";

// A Tuesday 6:12 PM in Frederick (America/New_York, EDT = UTC-4).
const TUE_EVENING = new Date("2026-07-07T22:12:00Z");

describe("fmtClock / fmtClockShort", () => {
  it("formats on-the-hour and minute times", () => {
    expect(fmtClock("21:00")).toBe("9 PM");
    expect(fmtClock("07:30")).toBe("7:30 AM");
    expect(fmtClock("00:00")).toBe("12 AM");
    expect(fmtClock("12:00")).toBe("12 PM");
    // "24:00" (an all-day close encoding) wraps to midnight, not "24 PM".
    expect(fmtClock("24:00")).toBe("12 AM");
  });
  it("returns null on bad values", () => {
    expect(fmtClock(undefined)).toBeNull();
    expect(fmtClock("late")).toBeNull();
  });
  it("short form drops the meridian for the running line", () => {
    expect(fmtClockShort("23:00")).toBe("11");
    expect(fmtClockShort("19:30")).toBe("7:30");
    expect(fmtClockShort(undefined)).toBeNull();
  });
});

describe("lipFact: one fact, chosen by value", () => {
  it("verified open wins and carries the live dot", () => {
    expect(
      lipFact(
        { open_status: { state: "open", closesAt: "23:00", closingSoon: false }, google_rating: 4.9 },
        "Frederick",
      ),
    ).toEqual({ text: "Open till 11 PM", live: true, dim: false });
  });
  it("all-day open reads as 24 hours, never a nonsense clock", () => {
    expect(
      lipFact(
        { open_status: { state: "open", closesAt: "24:00", closingSoon: false, allDay: true } },
        null,
      ),
    ).toEqual({ text: "Open 24 hours", live: true, dim: false });
  });
  it("closing soon states the closing time; the fact carries the urgency", () => {
    expect(
      lipFact({ open_status: { state: "closing-soon", closesAt: "19:00" } }, "Frederick"),
    ).toEqual({ text: "Closes 7 PM", live: true, dim: false });
  });
  it("closed prefers a same-day reopening over a bare 'Closed now'", () => {
    expect(
      lipFact(
        { open_status: { state: "closed", opensAt: "17:00", opensDay: "tue", opensToday: true } },
        "Frederick",
      ),
    ).toEqual({ text: "Opens 5 PM", live: false, dim: true });
    expect(
      lipFact({ open_status: { state: "closed", opensAt: "08:00", opensDay: "wed" }, google_rating: 4.7 }, "Frederick"),
    ).toEqual({ text: "Closed now", live: false, dim: true });
  });
  it("without verified hours, falls to rating, then distance, then town", () => {
    expect(lipFact({ open_status: { state: "unverified" }, google_rating: 4.62 }, "Frederick"))
      .toEqual({ text: "★ 4.6", live: false, dim: true });
    expect(lipFact({ open_status: { state: "unknown" }, distance_m: 640 }, "Frederick"))
      .toEqual({ text: "0.4 mi", live: false, dim: true });
    expect(lipFact({ open_status: { state: "unknown" } }, "Brunswick"))
      .toEqual({ text: "Brunswick", live: false, dim: true });
    expect(lipFact({ open_status: { state: "unknown" } }, null)).toBeNull();
  });
});

describe("todayHoursLine: prints the shipped schedule, not a verdict", () => {
  const hours: Hours = {
    tue: [{ open: "11:00", close: "23:00" }],
    wed: [{ open: "08:00", close: "17:00" }],
    sat: [{ open: "07:00", close: "12:00" }, { open: "17:00", close: "21:00" }],
  };
  it("labels today's window Today", () => {
    expect(todayHoursLine(hours, TUE_EVENING)).toEqual({
      label: "Today",
      value: "11 AM – 11 PM",
    });
  });
  it("falls to Tomorrow, then the weekday name, and joins split windows", () => {
    const noTue: Hours = { wed: hours.wed, sat: hours.sat };
    expect(todayHoursLine(noTue, TUE_EVENING)).toEqual({
      label: "Tomorrow",
      value: "8 AM – 5 PM",
    });
    const satOnly: Hours = { sat: hours.sat };
    expect(todayHoursLine(satOnly, TUE_EVENING)).toEqual({
      label: "Sat",
      value: "7 AM – 12 PM, 5 PM – 9 PM",
    });
  });
  it("reads an all-day window as Open 24 hours", () => {
    expect(todayHoursLine({ tue: [{ open: "00:00", close: "24:00" }] }, TUE_EVENING)).toEqual({
      label: "Today",
      value: "Open 24 hours",
    });
  });
  it("returns null when there is no schedule at all", () => {
    expect(todayHoursLine(undefined, TUE_EVENING)).toBeNull();
    expect(todayHoursLine({}, TUE_EVENING)).toBeNull();
  });
});

describe("ledger helpers", () => {
  it("distanceLabel switches units at a quarter mile", () => {
    expect(distanceLabel(320)).toBe("320 m");
    expect(distanceLabel(640)).toBe("0.4 mi");
    expect(distanceLabel(undefined)).toBeNull();
    expect(distanceLabel(-3)).toBeNull();
  });
  it("priceGlyphs splits the band into shown and dimmed dollars", () => {
    expect(priceGlyphs(2)).toEqual({ shown: "$$", off: "$$" });
    expect(priceGlyphs(4)).toEqual({ shown: "$$$$", off: "" });
    expect(priceGlyphs(undefined)).toBeNull();
    expect(priceGlyphs(0)).toBeNull();
    expect(priceGlyphs(5)).toBeNull();
  });
  it("savedDateLabel renders a short date and refuses the epoch sentinel", () => {
    expect(savedDateLabel("2026-06-14T15:00:00.000Z")).toBe("Jun 14");
    expect(savedDateLabel("1970-01-01T00:00:00.000Z")).toBeNull();
    expect(savedDateLabel("not a date")).toBeNull();
    expect(savedDateLabel(undefined)).toBeNull();
  });
  it("plate numbers climb in roman numerals then fall back to digits", () => {
    expect(plate(0)).toBe("I");
    expect(plate(5)).toBe("VI");
    expect(plate(12)).toBe("13");
  });
});
