import { describe, expect, it } from "vitest";
import {
  distanceLabel,
  fmtClock,
  fmtClockShort,
  lipFact,
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
  it("passes over the ended tail of last night and names the next opening", () => {
    const bar: Hours = Object.fromEntries(
      (["tue", "wed", "thu", "fri", "sat"] as const).map((day) => [day, [{ open: "17:00", close: "02:00" }]]),
    );
    // Sunday, December 6, 2026 in Frederick (EST = UTC-5). Closed Sunday and
    // Monday, so the only Sunday window is Saturday night's tail.
    expect(todayHoursLine(bar, new Date("2026-12-06T20:00:00Z"))).toEqual({ label: "Tue", value: "5 PM – 2 AM" });
    // At 1 AM that tail is still running, so it is today's hours.
    expect(todayHoursLine(bar, new Date("2026-12-06T06:00:00Z"))).toEqual({ label: "Today", value: "12 AM – 2 AM" });
    // A night that opens again today keeps both windows on today's line.
    expect(todayHoursLine(bar, new Date("2026-12-05T20:00:00Z"))).toEqual({ label: "Today", value: "12 AM – 2 AM, 5 PM – 2 AM" });
  });
  it("returns null when there is no schedule at all", () => {
    expect(todayHoursLine(undefined, TUE_EVENING)).toBeNull();
    expect(todayHoursLine({}, TUE_EVENING)).toBeNull();
  });
});

describe("todayHoursLine: follows dated exceptions like the place page", () => {
  // The library's ordinary week, with the published Thanksgiving changes.
  const weekly: Hours = {
    mon: [{ open: "10:00", close: "21:00" }],
    tue: [{ open: "10:00", close: "21:00" }],
    wed: [{ open: "10:00", close: "21:00" }],
    thu: [{ open: "10:00", close: "21:00" }],
    fri: [{ open: "10:00", close: "17:00" }],
    sat: [{ open: "10:00", close: "17:00" }],
  };
  function libraryHours(observed: Date): Hours {
    return {
      ...weekly,
      _official: {
        slug: "c-burr-artz-public-library-frederick",
        source_url: "https://example.test/hours",
        observed_at: new Date(observed.getTime() - 60_000).toISOString(),
        expires_at: new Date(observed.getTime() + 7 * 86_400_000).toISOString(),
        coverage_from: "2026-11-01",
        coverage_through: "2026-12-31",
        exceptions: [
          { date: "2026-11-25", reason: "Thanksgiving Eve", closes_at: "17:00" },
          { date: "2026-11-26", reason: "Thanksgiving", closed: true },
          { date: "2026-11-27", reason: "Day after Thanksgiving", closed: true },
        ],
      },
    };
  }
  // Wednesday, November 25, 2026, 11 AM in Frederick (EST = UTC-5).
  const THANKSGIVING_EVE = new Date("2026-11-25T16:00:00Z");
  const THANKSGIVING = new Date("2026-11-26T16:00:00Z");

  it("clips today to a dated early closing instead of printing the weekly window", () => {
    expect(todayHoursLine(libraryHours(THANKSGIVING_EVE), THANKSGIVING_EVE)).toEqual({
      label: "Today",
      value: "10 AM – 5 PM",
    });
  });
  it("skips dated closures and names the next date that is open", () => {
    expect(todayHoursLine(libraryHours(THANKSGIVING), THANKSGIVING)).toEqual({
      label: "Sat",
      value: "10 AM – 5 PM",
    });
    // With the eve closed too, the next two dates are closed as well.
    const eve = libraryHours(THANKSGIVING_EVE);
    eve._official!.exceptions[0] = { date: "2026-11-25", reason: "Closed", closed: true };
    expect(todayHoursLine(eve, THANKSGIVING_EVE)).toEqual({ label: "Sat", value: "10 AM – 5 PM" });
  });
  it("never prints weekly hours for a Thanksgiving nobody confirmed", () => {
    expect(todayHoursLine(weekly, THANKSGIVING)).toEqual({
      label: "Today",
      value: "Hours not confirmed",
    });
    // A later date that cannot be confirmed ends the search there. The card's
    // own status promises nothing past it, so neither does the ledger.
    expect(todayHoursLine({ ...weekly, wed: [] }, THANKSGIVING_EVE)).toEqual({
      label: "Tomorrow",
      value: "Hours not confirmed",
    });
    expect(todayHoursLine({ ...weekly, tue: [], wed: [] }, new Date("2026-11-24T16:00:00Z"))).toEqual({
      label: "Thu",
      value: "Hours not confirmed",
    });
  });
  it("does not print a schedule whose evidence has lapsed", () => {
    const lapsed = new Date("2026-12-09T16:00:00Z");
    expect(todayHoursLine(libraryHours(THANKSGIVING_EVE), lapsed)).toEqual({
      label: "Today",
      value: "Hours not confirmed",
    });
  });
  it("names the service when the hours describe only one", () => {
    const dinner = libraryHours(THANKSGIVING_EVE);
    dinner._official!.qualification = { scope: "kitchen", label: "Dinner hours", note: "Dinner service", usage: "display_only" };
    expect(todayHoursLine(dinner, THANKSGIVING_EVE)).toEqual({ label: "Dinner hours today", value: "10 AM – 5 PM" });
    expect(todayHoursLine(dinner, THANKSGIVING)).toEqual({ label: "Dinner hours, Sat", value: "10 AM – 5 PM" });
  });
  it("still has nothing to say about a place with no hours on a holiday", () => {
    expect(todayHoursLine({}, THANKSGIVING)).toBeNull();
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
});
