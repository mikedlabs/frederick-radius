import { describe, expect, it } from "vitest";
import { CIVIC_ACTIONS, matchCivicAction } from "@/data/civic-actions";

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

  it("answers a recycling-pickup question with the County schedule, not the missed-collection form", () => {
    const action = matchCivicAction("when is recycling pickup?");
    expect(action?.id).toBe("recycling-schedule");
    expect(action?.url).toContain("Curbside-Collection-Schedule");
    expect(action?.publisher).toBeUndefined();
  });

  it("answers 'when is trash day' with the trash schedule and names its publisher", () => {
    const action = matchCivicAction("when is trash day");
    expect(action?.id).toBe("trash-schedule");
    expect(action?.publisher).toBe("City of Frederick");
    expect(action?.url).toContain("cityoffrederickmd.gov/236/Collection-Schedule");
    // The County does not collect trash, so the answer has to say whose
    // schedule this is and point to recycling separately.
    expect(action?.answer).toMatch(/depends on where you live/);
    expect(action?.related).toEqual(["recycling-schedule"]);
  });

  it("reaches the trash schedule when the question says garbage or yard waste", () => {
    expect(matchCivicAction("when is garbage day")?.id).toBe("trash-schedule");
    expect(matchCivicAction("yard waste pickup")?.id).toBe("trash-schedule");
  });

  it("answers a question about both services with the answer that covers both", () => {
    const action = matchCivicAction("trash and recycling schedule");
    expect(action?.id).toBe("trash-schedule");
    expect(action?.related).toEqual(["recycling-schedule"]);
    expect(matchCivicAction("recycling and garbage pickup")?.id).toBe("trash-schedule");
    // A recycling-only question still gets the County schedule.
    expect(matchCivicAction("when is recycling day")?.id).toBe("recycling-schedule");
  });

  it("does not read restaurant curbside pickup as a collection question", () => {
    expect(matchCivicAction("restaurants with curbside pickup")).toBeNull();
  });

  it("routes a trash-pickup-schedule question to the trash schedule", () => {
    expect(matchCivicAction("trash pickup schedule")?.id).toBe("trash-schedule");
  });

  it("keeps a missed-collection report on the report form", () => {
    expect(matchCivicAction("report a missed recycling pickup")?.id).toBe("missing-recycling");
  });

  it("only relates actions that exist", () => {
    const ids = new Set(CIVIC_ACTIONS.map((action) => action.id));
    for (const action of CIVIC_ACTIONS) {
      for (const related of action.related ?? []) expect(ids.has(related)).toBe(true);
    }
  });
});
