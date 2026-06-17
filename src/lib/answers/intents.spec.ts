import { describe, it, expect } from "vitest";
import { QUICK_INTENTS, findQuickAnswers } from "@/lib/answers/intents";

describe("findQuickAnswers (extracted SearchOverlay logic, single source)", () => {
  it("matches a known phrase to its intent", () => {
    expect(findQuickAnswers("anything open right now?")[0]?.status).toBe("open-now");
    expect(findQuickAnswers("where to park downtown")[0]?.key).toBe("parking");
    expect(findQuickAnswers("next marc train")[0]?.key).toBe("transit");
  });

  it("ignores queries shorter than 3 chars", () => {
    expect(findQuickAnswers("a")).toEqual([]);
    expect(findQuickAnswers("")).toEqual([]);
  });

  it("every intent carries the fields the overlay + AnswerCards need", () => {
    for (const i of QUICK_INTENTS) {
      expect(i.href).toBeTruthy();
      expect(i.chip).toBeTruthy();
      expect(["clock", "calendar", "train", "pin"]).toContain(i.icon);
    }
  });
});

// buildTodayAnswers + its tests were removed on 2026-06-17: the /today
// "answers lead" section it fed only ever rendered the "On tonight" card,
// which duplicated the SkyHero's tonight teaser, so the card, the section,
// and the loader were all retired together.
