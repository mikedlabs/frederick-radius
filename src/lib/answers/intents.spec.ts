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
    // openCount gates the card's presence (honest), but no longer headlines
    // it with the tally. With no named lead it falls back to a count line.
    expect(a[0].id).toBe("open-now");
    expect(a[0].title).toBe("Open right now");
    // Every answer must carry a primary action (one move).
    expect(a.every((x) => x.primaryAction?.href)).toBe(true);
  });

  it("names the open-now lead place when one is supplied, count drops to support", () => {
    const a = buildTodayAnswers({
      openCount: 23,
      openLead: { name: "Gravel & Grind", distance_m: 640, slug: "gravel-and-grind" },
      tonightCount: 0,
      tonightBest: null,
      weekendCount: 0,
      weekendBest: null,
      parking: null,
    });
    const openNow = a.find((x) => x.id === "open-now");
    // Headline NAMES the place (a real, specific answer) — never the count.
    expect(openNow?.title).toBe("Gravel & Grind is open now");
    expect(openNow?.title).not.toMatch(/\d/);
    // The count lives in the supporting line, as supporting detail.
    expect(openNow?.answer).toContain("22 more");
    // The distance fills the mono data slot (from the downtown anchor).
    expect(openNow?.distanceLabel).toBeTruthy();
    // The discredited "near downtown" proximity claim is gone.
    expect(`${openNow?.title} ${openNow?.answer}`).not.toMatch(/near downtown/i);
  });
});
