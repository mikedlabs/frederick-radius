import { describe, expect, it } from "vitest";
import { matchCivicAction } from "@/data/civic-actions";

describe("matchCivicAction", () => {
  it("does not confuse conversational words with civic substrings", () => {
    expect(matchCivicAction("Where can I get coffee open now near downtown?")).toBeNull();
  });

  it("matches a specific resident action", () => {
    expect(matchCivicAction("How do I report a pothole?")?.id).toBe("fixit");
    expect(matchCivicAction("Who handles a pothole?")?.id).toBe("fixit");
  });

  it("matches an explicit county information request", () => {
    expect(matchCivicAction("Show me the county budget")?.id).toBe("budget");
  });

  it("leads a voter-registration question with the authoritative action", () => {
    const action = matchCivicAction("How do I register to vote in Frederick County?");
    expect(action?.id).toBe("register-vote");
    expect(action?.url).toContain("Voter-Registration---RegisterMake-Change");
  });

  it("does not count generic Frederick County language as civic evidence", () => {
    expect(matchCivicAction("What should I do for dinner in Frederick County?")).toBeNull();
  });

  it("does not treat a restaurant search as a food-license request", () => {
    expect(matchCivicAction("restaurant open now")?.id).not.toBe("food-license");
  });

  it("does not turn countywide dining language into a food-license request", () => {
    expect(matchCivicAction("Good food spots in northern or western Frederick County")).toBeNull();
  });

  it("still matches an actual restaurant-license request", () => {
    expect(matchCivicAction("How do I get a restaurant license?")?.id).toBe("food-license");
  });

  it("does not turn a request to find a physical amenity into a county action", () => {
    expect(matchCivicAction("Where can I find a public trash can or drinking water downtown?")).toBeNull();
  });
});
