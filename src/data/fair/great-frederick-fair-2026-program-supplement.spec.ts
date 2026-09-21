import { describe, expect, it } from "vitest";
import { fairProgramLocalDate } from "@/lib/fair/program-view";
import { greatFrederickFair2026Pack, greatFrederickFair2026PackPointer } from "./great-frederick-fair-2026-pack";
import { FAIR_PROGRAM_PDF_REVIEW, fairProgramSupplementEntrySchema, fairProgramSupplementSourceItem, greatFrederickFair2026ProgramSupplement, reviewedFairProgramSupplement } from "./great-frederick-fair-2026-program-supplement";

const imported = greatFrederickFair2026Pack.schedule.days.flatMap((day) => day.items);

describe("reviewed Fair printed-program supplement", () => {
  it("transcribes every nonblank music cell, all nine character visits, and exactly three Bluey windows", () => {
    expect(greatFrederickFair2026ProgramSupplement).toHaveLength(56);
    expect(greatFrederickFair2026ProgramSupplement.filter((entry) => entry.category === "music")).toHaveLength(44);
    expect(greatFrederickFair2026ProgramSupplement.filter((entry) => entry.category === "character")).toHaveLength(9);
    expect(greatFrederickFair2026ProgramSupplement.filter((entry) => entry.category === "bluey").map((entry) => entry.date)).toEqual(["2026-09-23", "2026-09-24", "2026-09-25"]);
    expect(new Set(greatFrederickFair2026ProgramSupplement.map((entry) => entry.id)).size).toBe(56);
    expect(greatFrederickFair2026ProgramSupplement.some((entry) => entry.id === "schedule-2026-09-18-pdf-funky-1130")).toBe(false);
    expect(greatFrederickFair2026ProgramSupplement.find((entry) => entry.identity === "Faith at the Fair")).toMatchObject({ start: "10:30", date: "2026-09-20" });
  });

  it("retains the Aug 25 PDF revision separately from the Sep 21 review and exact page links", () => {
    expect(FAIR_PROGRAM_PDF_REVIEW).toMatchObject({ checkedOn: "2026-09-21", sourceModifiedAt: "2026-08-25T19:20:24Z", sourceRevision: "pdf-revision-2026-08-25" });
    for (const entry of greatFrederickFair2026ProgramSupplement) {
      expect(fairProgramSupplementEntrySchema.safeParse(entry).success).toBe(true);
      const source = fairProgramSupplementSourceItem(entry);
      expect(source.sourceUrl).toBe(`${FAIR_PROGRAM_PDF_REVIEW.sourceUrl}#page=${entry.page}`);
      expect(source.sourceModifiedAt).toBe(FAIR_PROGRAM_PDF_REVIEW.sourceModifiedAt);
      expect(source.dayId).toBe(`day-${entry.date}`);
      expect(source.timeOrigin).toBe("explicit");
      expect(source.inheritedTimeLabel).toBeNull();
      if (source.startsAt) expect(fairProgramLocalDate(source.startsAt)).toBe(entry.date);
      if (source.endsAt) {
        expect(fairProgramLocalDate(source.endsAt)).toBe(entry.date);
        expect(Date.parse(source.endsAt)).toBeGreaterThan(Date.parse(source.startsAt!));
      }
    }
  });

  it("retains three opening-Friday conflicts as untimed facts instead of promising access before 4pm", () => {
    const conflicts = greatFrederickFair2026ProgramSupplement.filter((entry) => entry.conflict);
    expect(conflicts.map((entry) => entry.id)).toEqual(["schedule-2026-09-18-pdf-funky-1300", "schedule-2026-09-18-pdf-funky-1500", "schedule-2026-09-18-pdf-character"]);
    for (const entry of conflicts) {
      expect(fairProgramSupplementSourceItem(entry)).toMatchObject({ timing: "unspecified", startsAt: null, endsAt: null });
      expect(entry.conflict).toContain("before the reviewed 4pm opening");
      expect(fairProgramSupplementEntrySchema.safeParse({ ...entry, conflict: undefined }).success).toBe(false);
    }
  });

  it("rejects invalid days, reversed windows, malformed clocks and identity drift", () => {
    const entry = greatFrederickFair2026ProgramSupplement.find((item) => item.category === "bluey")!;
    for (const patch of [{ date: "2026-09-27" }, { start: "25:00" }, { end: "12:00" }, { id: "schedule-2026-09-24-pdf-bluey" }, { page: 7 }]) {
      expect(fairProgramSupplementEntrySchema.safeParse({ ...entry, ...patch }).success).toBe(false);
    }
  });

  it("deduplicates Faith at the Fair without changing the immutable 188-row promoted pack", () => {
    const before = JSON.stringify(greatFrederickFair2026Pack);
    const extra = reviewedFairProgramSupplement(imported);
    expect(imported).toHaveLength(188);
    expect(greatFrederickFair2026PackPointer.itemCount).toBe(188);
    expect(extra).toHaveLength(55);
    expect(extra.some((entry) => entry.identity === "Faith at the Fair")).toBe(false);
    expect(JSON.stringify(greatFrederickFair2026Pack)).toBe(before);
    expect(imported.every((item) => item.sourceUrl === "https://thegreatfrederickfair.com/schedule/")).toBe(true);
  });

  it("prefers a promoted performance at a contradictory newer time without changing its source", () => {
    const entry = greatFrederickFair2026ProgramSupplement.find((item) => item.id === "schedule-2026-09-21-pdf-funky-1300")!;
    const row = { ...fairProgramSupplementSourceItem(entry), id: "schedule-2026-09-21-web-shredded-cheddar", startsAt: "2026-09-21T18:00:00.000Z", timeLabel: "2pm", sourceModifiedAt: "2026-09-20T12:00:00Z", sourceUrl: "https://thegreatfrederickfair.com/schedule/" as const };
    const before = JSON.stringify(row);
    expect(reviewedFairProgramSupplement([...imported, row]).some((candidate) => candidate.id === entry.id)).toBe(false);
    expect(JSON.stringify(row)).toBe(before);
  });

  it("deduplicates one repeated performance without dropping a distinct set by that artist", () => {
    const evening = greatFrederickFair2026ProgramSupplement.find((entry) => entry.id === "schedule-2026-09-21-pdf-funky-1700")!;
    const row = { ...fairProgramSupplementSourceItem(evening), id: "schedule-2026-09-21-web-dennis-lee", sourceUrl: "https://thegreatfrederickfair.com/schedule/" as const };
    const extra = reviewedFairProgramSupplement([...imported, row]);
    expect(extra.some((entry) => entry.id === evening.id)).toBe(false);
    expect(extra.some((entry) => entry.id === "schedule-2026-09-21-pdf-funky-1500")).toBe(true);
  });

  it("deduplicates the source's slash-separated character pair against readable display copy", () => {
    const entry = greatFrederickFair2026ProgramSupplement.find((item) => item.id === "schedule-2026-09-19-pdf-character")!;
    const row = { ...fairProgramSupplementSourceItem(entry), id: "schedule-2026-09-19-web-character", text: "Spiderman/Black Widow character visit", sourceUrl: "https://thegreatfrederickfair.com/schedule/" as const };
    expect(reviewedFairProgramSupplement([...imported, row]).some((candidate) => candidate.id === entry.id)).toBe(false);
  });
});
