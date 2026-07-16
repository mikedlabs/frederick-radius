import { describe, expect, it } from "vitest";
import { matchCivicAction } from "@/data/civic-actions";

describe("matchCivicAction", () => {
  it("does not confuse conversational words with civic substrings", () => {
    expect(matchCivicAction("Where can I get coffee open now near downtown?")).toBeNull();
  });

  it("matches a specific resident action", () => {
    expect(matchCivicAction("How do I report a pothole?")?.id).toBe("fixit");
  });

  it("matches an explicit county information request", () => {
    expect(matchCivicAction("Show me the county budget")?.id).toBe("budget");
  });

  it("does not treat a restaurant search as a food-license request", () => {
    expect(matchCivicAction("restaurant open now")?.id).not.toBe("food-license");
  });
});
