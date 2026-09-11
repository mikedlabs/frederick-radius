import { describe, expect, it } from "vitest";
import { decisionRate, summarizeDecisionRows } from "./model";

describe("decision dashboard model", () => {
  it("builds the funnel, feedback, surface, and action totals", () => {
    const summary = summarizeDecisionRows([
      { day: "2026-08-12", surface: "today", stage: "impression", entityKind: "place", position: "lead", action: "none", count: 100 },
      { day: "2026-08-12", surface: "today", stage: "open", entityKind: "place", position: "lead", action: "open", count: 40 },
      { day: "2026-08-12", surface: "today", stage: "action", entityKind: "place", position: "lead", action: "directions", count: 12 },
      { day: "2026-08-12", surface: "ask", stage: "impression", entityKind: "answer", position: "result", action: "none", count: 20 },
      { day: "2026-08-12", surface: "ask", stage: "feedback", entityKind: "answer", position: "result", action: "helpful", count: 7 },
      { day: "2026-08-12", surface: "ask", stage: "feedback", entityKind: "answer", position: "result", action: "wrong", count: 2 },
    ]);

    expect(summary).toMatchObject({
      impressions: 120,
      opens: 40,
      actions: 12,
      feedback: 9,
      helpful: 7,
      notRelevant: 0,
      wrong: 2,
    });
    expect(summary.surfaces).toEqual([
      { surface: "today", impressions: 100, opens: 40, actions: 12, feedback: 0 },
      { surface: "ask", impressions: 20, opens: 0, actions: 0, feedback: 9 },
    ]);
    expect(summary.actionBreakdown).toEqual([{ action: "directions", count: 12 }]);
  });

  it("ignores invalid counts and handles an empty denominator honestly", () => {
    const summary = summarizeDecisionRows([
      { day: "2026-08-12", surface: "map", stage: "open", entityKind: "place", position: "sheet", action: "open", count: -2 },
    ]);
    expect(summary.opens).toBe(0);
    expect(decisionRate(0, 0)).toBe("n/a");
    expect(decisionRate(1, 4)).toBe("25%");
  });
});
