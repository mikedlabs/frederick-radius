import { describe, expect, it } from "vitest";
import { countyDecisionClause, municipalityMatchesRegions, parseCountyRegions } from "@/data/county-regions";

describe("Frederick County regions", () => {
  it("reads the destination from the user's final request, not their dining history", () => {
    const query = "I've eaten pretty much all of DTF, central and eastern Frederick. But I want good spots in the northern or western portion of the county.";
    expect(countyDecisionClause(query)).toContain("northern or western");
    expect(parseCountyRegions(query)).toEqual(["north", "west"]);
  });

  it("does not treat the places before a direct question as requested regions", () => {
    const query = "I have eaten downtown and central Frederick. What are good restaurants in northern or western Frederick County?";
    expect(countyDecisionClause(query)).toContain("good restaurants in northern or western");
    expect(parseCountyRegions(query)).toEqual(["north", "west"]);
  });

  it("supports short directional requests", () => {
    expect(parseCountyRegions("Take me somewhere worth the drive north or west of Frederick")).toEqual(["north", "west"]);
  });

  it("maps municipalities to the requested county areas", () => {
    expect(municipalityMatchesRegions("thurmont", ["north"])).toBe(true);
    expect(municipalityMatchesRegions("middletown", ["west"])).toBe(true);
    expect(municipalityMatchesRegions("frederick", ["north", "west"])).toBe(false);
  });
});
