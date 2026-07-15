import { describe, expect, it } from "vitest";
import { CRAVING_BY_KEY, matchesCraving } from "./cravings";

describe("canonical craving eligibility", () => {
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
});
