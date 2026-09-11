import { describe, it, expect } from "vitest";
import { QUICK_INTENTS, findQuickAnswers } from "@/lib/answers/intents";

describe("findQuickAnswers (extracted SearchOverlay logic, single source)", () => {
  it("matches a known phrase to its intent", () => {
    expect(findQuickAnswers("anything open right now?")[0]?.status).toBe("open-now");
    expect(findQuickAnswers("where to park downtown")[0]?.key).toBe("parking");
    expect(findQuickAnswers("next marc train")[0]?.key).toBe("transit");
    expect(findQuickAnswers("nearest blue mailbox")[0]?.href).toBe("/shipping");
    expect(findQuickAnswers("where is a water fountain")[0]?.href).toBe("/amenities?need=water");
    expect(findQuickAnswers("where is the closest trash can")[0]?.href).toBe("/amenities?need=trash");
    expect(findQuickAnswers("I need a dog bag")[0]?.href).toBe("/amenities?need=dog-bags");
    expect(findQuickAnswers("where can I charge my phone")[0]?.href).toBe("/amenities?need=power");
    expect(findQuickAnswers("brunch this weekend")[0]?.href).toBe("/brunch");
    expect(findQuickAnswers("food trucks today")[0]?.href).toBe("/food-trucks");
  });

  it("ignores queries shorter than 3 chars", () => {
    expect(findQuickAnswers("a")).toEqual([]);
    expect(findQuickAnswers("")).toEqual([]);
  });

  it("leads a craving query with the nearest-open craving answer", () => {
    const top = findQuickAnswers("coffee open now near me")[0];
    expect(top?.key).toBe("craving:coffee");
    expect(top?.href).toBe("/nearby?c=coffee");
    // "beer" resolves to breweries, not the broad drinks bucket.
    expect(findQuickAnswers("where's a good beer")[0]?.href).toBe("/nearby?c=breweries");
  });

  it("still answers a bare open-now query with the open-now intent", () => {
    expect(findQuickAnswers("anything open right now?")[0]?.status).toBe("open-now");
    expect(findQuickAnswers("what's open")[0]?.key).toBe("open-now");
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
