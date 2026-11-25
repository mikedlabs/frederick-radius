import { describe, expect, it } from "vitest";
import { hoursCoverageNote, openNowHeaderCopy } from "./coverage-note";

describe("hoursCoverageNote", () => {
  it("states how many places have current hours countywide as one complete sentence", () => {
    expect(hoursCoverageNote(37, 1571)).toBe(
      "Radius has current hours for 37 of 1,571 places countywide, so more may be open.",
    );
    expect(hoursCoverageNote(1204, 1571)).toBe(
      "Radius has current hours for 1,204 of 1,571 places countywide, so more may be open.",
    );
  });

  it("says nothing when no place has current hours, because the lede already says so", () => {
    expect(hoursCoverageNote(0, 1571)).toBeNull();
  });

  it("says nothing when every place has current hours, because nothing more may be open", () => {
    expect(hoursCoverageNote(1571, 1571)).toBeNull();
  });

  it("says nothing for a count it cannot trust", () => {
    expect(hoursCoverageNote(Number.NaN, 1571)).toBeNull();
    expect(hoursCoverageNote(37, Number.POSITIVE_INFINITY)).toBeNull();
    expect(hoursCoverageNote(-3, 1571)).toBeNull();
  });
});

describe("openNowHeaderCopy", () => {
  const coverage = { currentHours: 37, totalPlaces: 1571 };

  it("puts the coverage sentence beside the count lede", () => {
    expect(openNowHeaderCopy({ confirmedOpen: 21, likelyOpen: 4, ...coverage })).toEqual({
      lede: "21 places are confirmed open.",
      coverageNote: "Radius has current hours for 37 of 1,571 places countywide, so more may be open.",
    });
    expect(openNowHeaderCopy({ confirmedOpen: 1, likelyOpen: 0, ...coverage }).lede).toBe(
      "1 place is confirmed open.",
    );
  });

  it("keeps the countywide base in a town scope, where the lede counts only the town", () => {
    // Thurmont at 11:40 AM on November 25, 2026: two confirmed-open rows
    // against the county's 37 of 1,571.
    const { lede, coverageNote } = openNowHeaderCopy({ confirmedOpen: 2, likelyOpen: 0, ...coverage });
    expect(lede).toBe("2 places are confirmed open.");
    expect(coverageNote).toContain("places countywide");
  });

  it("leaves the coverage sentence out when only likely-open places remain", () => {
    expect(openNowHeaderCopy({ confirmedOpen: 0, likelyOpen: 5, ...coverage })).toEqual({
      lede: "Some places are usually open at this hour. Check with the venue before going.",
      coverageNote: null,
    });
  });

  it("leaves the coverage sentence out when nothing is confirmed or likely open", () => {
    // Every night on the committed data (open 0, likely 0, current hours 37),
    // and all day in a town with no confirmed-open place.
    expect(openNowHeaderCopy({ confirmedOpen: 0, likelyOpen: 0, ...coverage })).toEqual({
      lede: "No county listings have recently checked hours confirming they are open.",
      coverageNote: null,
    });
  });

  it("leaves the coverage sentence out when its count would contradict the lede or is unavailable", () => {
    expect(openNowHeaderCopy({ confirmedOpen: 40, likelyOpen: 0, ...coverage }).coverageNote).toBeNull();
    expect(
      openNowHeaderCopy({ confirmedOpen: 21, likelyOpen: 0, currentHours: null, totalPlaces: null }).coverageNote,
    ).toBeNull();
  });
});
