import { describe, expect, it } from "vitest";

import { FAIR_FEEDBACK_MAX_CONTEXT } from "@/lib/feedback";
import { parseFeedbackOpenDetail } from "@/lib/feedback-ui";

describe("parseFeedbackOpenDetail", () => {
  it("accepts a fixed Fair category and cleans its display context", () => {
    expect(
      parseFeedbackOpenDetail({
        fairIssue: "map_wrong",
        fairContext: "  Gate  3\nnear the north entrance  ",
      }),
    ).toEqual({
      fairIssue: "map_wrong",
      fairContext: "Gate 3 near the north entrance",
    });
  });

  it("drops unknown categories instead of preselecting arbitrary input", () => {
    expect(
      parseFeedbackOpenDetail({
        fairIssue: "urgent_dispatch",
        fairContext: "untrusted",
      }),
    ).toBeNull();
    expect(parseFeedbackOpenDetail(null)).toBeNull();
  });

  it("bounds context before it reaches the feedback sheet", () => {
    const detail = parseFeedbackOpenDetail({
      fairIssue: "schedule_change",
      fairContext: "x".repeat(FAIR_FEEDBACK_MAX_CONTEXT + 100),
    });

    expect(detail?.fairContext).toHaveLength(FAIR_FEEDBACK_MAX_CONTEXT);
  });
});
