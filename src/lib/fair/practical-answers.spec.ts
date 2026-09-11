import { describe, expect, it } from "vitest";

import { greatFrederickFair2026PracticalAnswers } from "@/data/fair/great-frederick-fair-2026-practical-answers";

import {
  fairPracticalAnswersSchema,
  parseFairPracticalAnswers,
} from "./practical-answers";

describe("Fair practical answers", () => {
  it("keeps every published answer source-ranked and actionable", () => {
    const answers = parseFairPracticalAnswers(
      greatFrederickFair2026PracticalAnswers,
    );

    expect(answers.length).toBeGreaterThanOrEqual(10);
    expect(new Set(answers.map((answer) => answer.id)).size).toBe(
      answers.length,
    );
    expect(
      answers.every((answer) => answer.sources.every((source) => source.url.startsWith("https://"))),
    ).toBe(true);
    expect(
      answers.some((answer) => answer.evidence === "not-confirmed"),
    ).toBe(true);
  });

  it("keeps the official Fair access limits explicit", () => {
    const answers = parseFairPracticalAnswers(
      greatFrederickFair2026PracticalAnswers,
    );
    const accessAnswers = answers.filter(
      (answer) => answer.category === "accessibility",
    );

    expect(accessAnswers.map((answer) => answer.id)).toEqual([
      "fair-answer-asl-grandstand",
      "fair-answer-access-contact",
      "fair-answer-mobility-help",
      "fair-answer-sensory-friendly-carnival",
      "fair-answer-service-animal",
      "fair-answer-sensory-space",
    ]);
    expect(
      accessAnswers.find((answer) => answer.id === "fair-answer-asl-grandstand")
        ?.answer,
    ).toContain("evening musical Grandstand performance");
    expect(
      accessAnswers.find(
        (answer) => answer.id === "fair-answer-sensory-friendly-carnival",
      )?.answer,
    ).toContain("not a promise that the full fairground will be low-sensory");
    expect(
      accessAnswers.find((answer) => answer.id === "fair-answer-sensory-space")
        ?.evidence,
    ).toBe("not-confirmed");
  });

  it("will not promote one anecdote into a community pattern", () => {
    const result = fairPracticalAnswersSchema.safeParse([
      {
        id: "fair-answer-long-lines",
        category: "concert",
        question: "Should I expect long lines?",
        answer: "One visitor mentioned a line, which is not enough to call it a pattern.",
        evidence: "community-pattern",
        usefulBefore: ["leave-home"],
        sources: [
          {
            publisher: "Example review site",
            label: "One public review",
            url: "https://example.com/review",
            checkedAt: "2026-09-01T20:58:08Z",
          },
        ],
      },
    ]);

    expect(result.success).toBe(false);
  });
});
