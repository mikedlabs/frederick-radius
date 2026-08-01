import { describe, expect, it } from "vitest";
import {
  fieldNoteSources,
  fieldNotesFor,
  fieldNotesVerificationSummary,
  recordedFieldNoteVerificationDate,
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
