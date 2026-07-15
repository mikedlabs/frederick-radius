import { describe, expect, it } from "vitest";
import {
  matchesSearchQualifiers,
  parseSearchQualifiers,
  type SearchQualifierPlace,
} from "@/lib/search/qualifiers";

const openCoffee: SearchQualifierPlace = {
  category: "restaurant",
  subcategories: ["coffee"],
  name: "Cafe Nola",
  municipality: "frederick",
  open_status: { state: "open", closesAt: "21:00", closingSoon: false },
};

describe("search qualifiers", () => {
  it("parses category, open-now, and near-me as executable constraints", () => {
    const parsed = parseSearchQualifiers("coffee open now near me");
    expect(parsed.categoryKey).toBe("coffee");
    expect(parsed.openNow).toBe(true);
    expect(parsed.nearMe).toBe(true);
    expect(parsed.cleanedQuery).toBe("coffee");
  });

  it("matches corrected secondary categories and rejects closed results", () => {
    const parsed = parseSearchQualifiers("coffee open now near me");
    expect(matchesSearchQualifiers(openCoffee, parsed)).toBe(true);
    expect(
      matchesSearchQualifiers(
        { ...openCoffee, open_status: { state: "closed" } },
        parsed,
      ),
    ).toBe(false);
    expect(
      matchesSearchQualifiers(
        { ...openCoffee, name: "A Bridal Shop", category: "shopping", subcategories: [] },
        parsed,
      ),
    ).toBe(false);
  });

  it("honors a selected-town hard filter", () => {
    const parsed = parseSearchQualifiers("coffee");
    expect(matchesSearchQualifiers(openCoffee, parsed, "frederick")).toBe(true);
    expect(matchesSearchQualifiers(openCoffee, parsed, "thurmont")).toBe(false);
  });

  it("does not treat open mic as an open-now place filter", () => {
    const parsed = parseSearchQualifiers("open mic tonight");
    expect(parsed.openNow).toBe(false);
    expect(parsed.categoryKey).toBeNull();
  });
});
