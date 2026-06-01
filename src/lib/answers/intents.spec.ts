import { describe, it, expect } from "vitest";
import { QUICK_INTENTS, findQuickAnswers } from "@/lib/answers/intents";
import { buildTodayAnswers } from "@/lib/answers/defaultTodayAnswers";

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

describe("buildTodayAnswers (honest, never fabricates)", () => {
  it("omits empty windows and keeps only the transit anchor when there's no data", () => {
    const a = buildTodayAnswers({
      openCount: 0,
      tonightCount: 0,
      tonightBest: null,
      weekendCount: 0,
      weekendBest: null,
      parking: null,
    });
    expect(a.map((x) => x.id)).toEqual(["transit"]);
  });

  it("includes data-backed answers when present, capped at 5", () => {
    const a = buildTodayAnswers({
      openCount: 7,
      tonightCount: 3,
      tonightBest: { title: "Sky Stage", venue: "Carroll Creek", slug: "sky-stage" },
      weekendCount: 5,
      weekendBest: { title: "First Saturday", slug: "first-saturday" },
      parking: { name: "Carroll Creek Parking Deck", slug: "carroll-creek-parking-garage-frederick" },
    });
    expect(a.length).toBeLessThanOrEqual(5);
    expect(a[0].id).toBe("open-now");
    expect(a[0].title).toContain("7");
    // Every answer must carry a primary action (one move).
    expect(a.every((x) => x.primaryAction?.href)).toBe(true);
  });
});
