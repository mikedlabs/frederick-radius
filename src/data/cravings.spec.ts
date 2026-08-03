import { describe, expect, it } from "vitest";
import {
  CRAVING_BY_KEY,
  isPlaygroundPlace,
  matchesCraving,
  matchesCravingFacet,
} from "./cravings";

describe("canonical craving eligibility", () => {
  it("does not expose inherited object keys as URL-selectable cravings", () => {
    expect(CRAVING_BY_KEY.toString).toBeUndefined();
    expect(CRAVING_BY_KEY.constructor).toBeUndefined();
  });

  it("matches H Mart and Giant Eagle as grocery everywhere", () => {
    const grocery = CRAVING_BY_KEY.grocery;
    expect(matchesCraving(grocery, { category: "shopping", name: "H Mart Frederick" })).toBe(true);
    expect(matchesCraving(grocery, { category: "shopping", name: "Giant Eagle" })).toBe(true);
  });

  it("uses corrected secondary categories instead of one lossy primary bucket", () => {
    const coffee = CRAVING_BY_KEY.coffee;
    expect(matchesCraving(coffee, {
      category: "restaurant",
      subcategories: ["coffee"],
      name: "Cafe Nola",
    })).toBe(true);
  });

  it("recognizes source-backed playground evidence on parent parks", () => {
    expect(isPlaygroundPlace({
      category: "park",
      name: "Riverwalk Park",
      short_blurb: "Park featuring a baseball diamond, a playground, and picnic tables.",
    })).toBe(true);
    expect(isPlaygroundPlace({
      category: "park",
      name: "Neighborhood Park",
      short_blurb: "A small park with a tot-lot and a walking loop.",
    })).toBe(true);
    expect(isPlaygroundPlace({
      category: "park",
      name: "Baker Park",
      short_blurb: "A downtown park with a lake, tennis, and a carillon tower.",
    })).toBe(false);
  });

  it("accepts explicit category, subcategory, type, and name evidence", () => {
    expect(isPlaygroundPlace({
      category: "playground",
      name: "Community recreation area",
    })).toBe(true);
    expect(isPlaygroundPlace({
      category: "park",
      subcategories: ["playground"],
      name: "Community recreation area",
    })).toBe(true);
    expect(isPlaygroundPlace({
      category: "park",
      primary_type: "playground",
      name: "Community recreation area",
    })).toBe(true);
    expect(isPlaygroundPlace({
      category: "park",
      name: "West End Playground",
    })).toBe(true);
  });

  it("uses the same playground evidence in the Parks facet", () => {
    const playground = CRAVING_BY_KEY.outside.facets?.find(
      (facet) => facet.key === "playground",
    );
    expect(playground).toBeDefined();
    expect(matchesCravingFacet(playground!, {
      category: "park",
      name: "Willowdale Park",
      short_blurb: "City park with a playground and two pavilions.",
    })).toBe(true);
  });

  it("does not make business hours a gate for timeless or activity intents", () => {
    expect(CRAVING_BY_KEY.outside.availability).toBe("not-applicable");
    expect(CRAVING_BY_KEY.movies.availability).toBe("not-applicable");
    expect(CRAVING_BY_KEY.stay.availability).toBe("not-applicable");
    expect(CRAVING_BY_KEY.farms.availability).toBe("bonus");
    expect(CRAVING_BY_KEY.family.availability).toBe("bonus");
    expect(CRAVING_BY_KEY.pools.availability).toBe("bonus");
    expect(CRAVING_BY_KEY.coffee.availability).toBeUndefined();
  });
});
