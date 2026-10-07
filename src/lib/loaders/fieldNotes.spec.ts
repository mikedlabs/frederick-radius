import { describe, expect, it } from "vitest";
import {
  fieldNoteSources,
  fieldNotesFor,
  fieldNotesVerificationSummary,
  happyHourOnAt,
  happyHourWindowsFor,
  recordedFieldNoteVerificationDate,
  verifiedLabel,
} from "./fieldNotes";

describe("Field Notes verification evidence", () => {
  it("treats missing and malformed dates as unrecorded", () => {
    expect(recordedFieldNoteVerificationDate()).toBeNull();
    expect(recordedFieldNoteVerificationDate("not-a-date")).toBeNull();
    expect(recordedFieldNoteVerificationDate("2026-06-15")).toBe(
      "2026-06-15",
    );
  });

  it("does not let one dated row verify an undated row", () => {
    expect(
      fieldNotesVerificationSummary([
        {
          text: "A dated fact.",
          source_url: "https://example.com/dated",
          last_verified: "2026-06-15",
        },
        {
          text: "An older fact without a recorded check date.",
          source_url: "https://example.com/undated",
        },
      ]),
    ).toEqual({
      total: 2,
      dated: 1,
      undated: 1,
      allDated: false,
      latest: "2026-06-15",
    });
  });

  it("keeps the existing sourced-but-undated rows explicit", () => {
    const notes = fieldNotesFor("averys-maryland-grille-frederick");
    expect(notes).not.toBeNull();
    const rows = fieldNoteSources(notes!);
    const summary = fieldNotesVerificationSummary(rows);

    expect(rows.every((row) => Boolean(row.source_url))).toBe(true);
    expect(summary.undated).toBeGreaterThan(0);
    expect(summary.allDated).toBe(false);
  });
});

describe("Field Notes trust language", () => {
  const NOW = Date.parse("2026-10-07T18:00:00.000Z");

  it("dates a recorded check in the one trust format", () => {
    expect(verifiedLabel("2026-06-15", NOW)).toBe("Checked Jun 15");
    expect(verifiedLabel("2025-11-02", NOW)).toBe("Checked Nov 2, 2025");
    expect(verifiedLabel(undefined, NOW)).toBeNull();
    expect(verifiedLabel("not-a-date", NOW)).toBeNull();
  });
});

describe("structured happy-hour windows", () => {
  // Wed Oct 7 2026 on the Frederick clock.
  const wednesdayAt = (hourUtc: number) => new Date(Date.UTC(2026, 9, 7, hourUtc));

  it("parses each reviewed schedule once at the loader boundary", () => {
    // "Mon-Fri 4-6:30pm"
    expect(happyHourWindowsFor("black-hog-bbq-bar")).toEqual([
      { days: [1, 2, 3, 4, 5], start: 16 * 60, end: 18 * 60 + 30 },
    ]);
  });

  it("is on only while a window covers the Frederick clock", () => {
    expect(happyHourOnAt("black-hog-bbq-bar", wednesdayAt(21))).toBe(true); // 5 PM
    expect(happyHourOnAt("black-hog-bbq-bar", wednesdayAt(14))).toBe(false); // 10 AM
    expect(happyHourOnAt("black-hog-bbq-bar", new Date(Date.UTC(2026, 9, 10, 21)))).toBe(false); // Sat 5 PM
  });

  it("makes no claim for a schedule without a structured window", () => {
    // "Tue, Wed & Thu specials" names no time.
    expect(happyHourWindowsFor("averys-maryland-grille-frederick")).toEqual([]);
    expect(happyHourOnAt("averys-maryland-grille-frederick", wednesdayAt(21))).toBe(false);
    expect(happyHourOnAt("no-such-place", wednesdayAt(21))).toBe(false);
  });
});
