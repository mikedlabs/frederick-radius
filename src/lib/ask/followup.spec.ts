import { describe, expect, it } from "vitest";
import { contextualizeAskQuery } from "@/lib/ask/followup";

describe("contextualizeAskQuery", () => {
  it("carries context into a terse refinement", () => {
    expect(contextualizeAskQuery("closer and cheaper", "Find dinner near downtown")).toBe(
      "Find dinner near downtown. Follow-up: closer and cheaper",
    );
  });

  it("does not contaminate a complete new question", () => {
    expect(contextualizeAskQuery("What events are happening this weekend?", "Find dinner")).toBe(
      "What events are happening this weekend?",
    );
  });

  it("leaves the first question unchanged", () => {
    expect(contextualizeAskQuery("tomorrow", null)).toBe("tomorrow");
  });
});
