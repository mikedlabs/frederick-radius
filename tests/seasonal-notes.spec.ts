import { describe, it, expect } from "vitest";
import {
  SEASONAL_NOTES,
  COMPUTABLE_NOTE_IDS,
  pickSeasonalNote,
} from "@/lib/seasonal-notes";

describe("seasonal-notes", () => {
  it("every curated (non-computable) note carries a non-empty source", () => {
    for (const note of SEASONAL_NOTES) {
      if (COMPUTABLE_NOTE_IDS.has(note.id)) continue;
      expect(note.source, `${note.id} must cite a source`).toBeTruthy();
    }
  });

  it("picks First Saturday on the first Saturday of the month (Eastern)", () => {
    // 2026-07-04 16:00Z = Sat Jul 4 2026 in America/New_York, the first Saturday.
    const note = pickSeasonalNote(new Date("2026-07-04T16:00:00Z"));
    expect(note?.id).toBe("first-saturday");
  });

  it("uses the Eastern calendar day, not UTC, at the day boundary", () => {
    // 2026-07-05 03:00Z = Sat Jul 4 23:00 EDT — still the first Saturday Eastern.
    const stillSat = pickSeasonalNote(new Date("2026-07-05T03:00:00Z"));
    expect(stillSat?.id).toBe("first-saturday");
    // 2026-07-05 05:00Z = Sun Jul 5 01:00 EDT — no longer first Saturday.
    const sunday = pickSeasonalNote(new Date("2026-07-05T05:00:00Z"));
    expect(sunday?.id).not.toBe("first-saturday");
  });

  it("no longer surfaces the retired 'market season' blurb in summer", () => {
    // 2026-07-11 16:00Z = Sat Jul 11 2026 (second Saturday). The "Market season"
    // note was retired (the honest per-day market lives in OnNowBand /
    // OnNowStrip), so a mid-July non-first-Saturday day now has no seasonal note.
    expect(pickSeasonalNote(new Date("2026-07-11T16:00:00Z"))).toBeNull();
    expect(SEASONAL_NOTES.some((n) => n.id === "market-season")).toBe(false);
  });

  it("renders nothing on an ordinary off-season day", () => {
    // 2026-01-14 = Wed in January: not first Saturday, no active almanac note.
    expect(pickSeasonalNote(new Date("2026-01-14T16:00:00Z"))).toBeNull();
  });

  it("never surfaces the foliage note while it ships disabled", () => {
    // 2026-10-20 sits inside the would-be foliage window, but foliage is
    // disabled and market-season is retired, so October now has no note at all.
    const note = pickSeasonalNote(new Date("2026-10-20T16:00:00Z"));
    expect(note?.id).not.toBe("foliage-peak");
    expect(note).toBeNull();
  });
});
