import { describe, expect, it } from "vitest";
import {
  FIELD_NOTE_CHECK_WINDOW_DAYS,
  fieldNoteCheck,
  fieldNotesFor,
  recordedFieldNoteVerificationDate,
  verifiedLabel,
} from "./fieldNotes";

const at = (iso: string) => Date.parse(iso);

describe("Field Notes verification evidence", () => {
  it("treats missing and malformed dates as unrecorded", () => {
    expect(recordedFieldNoteVerificationDate()).toBeNull();
    expect(recordedFieldNoteVerificationDate("not-a-date")).toBeNull();
    expect(recordedFieldNoteVerificationDate("2026-06-15")).toBe(
      "2026-06-15",
    );
  });

  it("never gives an undated row a verification label", () => {
    expect(verifiedLabel()).toBeNull();
    expect(verifiedLabel("not-a-date")).toBeNull();
    expect(fieldNoteCheck()).toBeNull();
    expect(fieldNoteCheck("not-a-date")).toBeNull();
  });

  it("says verified only while the check is inside the window", () => {
    expect(fieldNoteCheck("2026-06-15", at("2026-06-15T15:00:00Z"))).toEqual({
      label: "verified today",
      current: true,
    });
    expect(fieldNoteCheck("2026-06-15", at("2026-06-20T12:00:00Z"))).toEqual({
      label: "verified 5d ago",
      current: true,
    });
    expect(fieldNoteCheck("2026-06-15", at("2026-07-06T12:00:00Z"))).toEqual({
      label: "verified 3w ago",
      current: true,
    });
    // A date ahead of the clock (a check recorded later the same day in
    // another zone) is still a current check.
    expect(fieldNoteCheck("2026-06-15", at("2026-06-14T23:00:00Z"))).toEqual({
      label: "verified just now",
      current: true,
    });
  });

  it("prints the month of an older check and stops calling it verified", () => {
    expect(FIELD_NOTE_CHECK_WINDOW_DAYS).toBe(60);
    // Day 60 is the last day inside the window, day 61 the first outside it.
    expect(fieldNoteCheck("2026-06-15", at("2026-08-14T12:00:00Z"))).toEqual({
      label: "verified 8w ago",
      current: true,
    });
    expect(fieldNoteCheck("2026-06-15", at("2026-08-15T12:00:00Z"))).toEqual({
      label: "last checked Jun 2026",
      current: false,
    });
    // The production case: a June check read on November 25.
    const november = at("2026-11-25T15:00:00Z");
    expect(verifiedLabel("2026-06-15", november)).toBe("last checked Jun 2026");
    expect(verifiedLabel("2026-06-15", november)).not.toMatch(/verified|mo ago/);
  });

  it("does not count a check dated in the future", () => {
    const november = at("2026-11-25T15:00:00Z");
    // A year typo ("2027" for "2026") would otherwise lead every list with a
    // verified badge until the typed day arrives.
    expect(fieldNoteCheck("2027-06-12", november)).toBeNull();
    expect(verifiedLabel("2027-06-12", november)).toBeNull();
    expect(fieldNoteCheck("2026-11-28T12:00:00Z", november)).toBeNull();
    // Clock and time zone skew of up to two days still reads as current.
    expect(fieldNoteCheck("2026-11-26", november)).toEqual({
      label: "verified just now",
      current: true,
    });
    expect(fieldNoteCheck("2026-11-27T14:00:00Z", november)?.current).toBe(true);
  });

  it("reads a date-only check as the calendar day it records", () => {
    // "2026-06-01" parses as UTC midnight, which is still May 31 in Frederick.
    expect(verifiedLabel("2026-06-01", at("2026-11-25T15:00:00Z"))).toBe(
      "last checked Jun 2026",
    );
  });

  it("keeps the existing sourced-but-undated rows explicit", () => {
    const notes = fieldNotesFor("averys-maryland-grille-frederick");
    expect(notes).not.toBeNull();
    const rows = [
      ...(notes!.happy_hour ? [notes!.happy_hour] : []),
      ...(notes!.deals ?? []),
      ...(notes!.parking ? [notes!.parking] : []),
      ...(notes!.insider ?? []),
    ];

    expect(rows.every((row) => Boolean(row.source_url))).toBe(true);
    expect(rows.some((row) => recordedFieldNoteVerificationDate(row.last_verified) === null)).toBe(true);
  });
});
