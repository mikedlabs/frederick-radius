import { describe, expect, it } from "vitest";
import {
  fieldNotesFor,
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

  it("never gives an undated row a verification label", () => {
    expect(verifiedLabel()).toBeNull();
    expect(verifiedLabel("not-a-date")).toBeNull();
    expect(verifiedLabel("2026-06-15")).toMatch(/^verified /);
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
