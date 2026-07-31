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

  it.each([
    ["pharmacy", { category: "pharmacy", primary_type: "pharmacy" }],
    ["gas-station", { category: "services", primary_type: "gas_station" }],
    ["atm", { category: "services", primary_type: "atm" }],
  ] as const)(
    "requires exact %s evidence instead of admitting an arbitrary nearby place",
    (strictPlaceKind, evidence) => {
      const query = strictPlaceKind === "gas-station"
        ? "nearest gas station"
        : strictPlaceKind === "atm"
          ? "nearest ATM"
          : "closest pharmacy";
      const parsed = parseSearchQualifiers(query);
      expect(parsed.strictPlaceKind).toBe(strictPlaceKind);
      expect(
        matchesSearchQualifiers(
          { ...openCoffee, ...evidence },
          parsed,
        ),
      ).toBe(true);
      expect(matchesSearchQualifiers(openCoffee, parsed)).toBe(false);
    },
  );

  it("requires explicit ATM evidence instead of assuming every bank has one", () => {
    const parsed = parseSearchQualifiers("nearest ATM");
    expect(
      matchesSearchQualifiers(
        {
          ...openCoffee,
          category: "services",
          name: "PNC Bank",
          primary_type: "bank",
        },
        parsed,
      ),
    ).toBe(false);
    expect(
      matchesSearchQualifiers(
        {
          ...openCoffee,
          category: "services",
          name: "Bank of America with Drive-thru ATM",
          primary_type: "bank",
        },
        parsed,
      ),
    ).toBe(true);
    expect(
      matchesSearchQualifiers(
        {
          ...openCoffee,
          category: "services",
          name: "A Downtown Salon",
          primary_type: "beauty_salon",
        },
        parsed,
      ),
    ).toBe(false);
  });

  it("keeps the open-now gate strict for pharmacies", () => {
    const parsed = parseSearchQualifiers("closest pharmacy open now");
    expect(parsed.strictPlaceKind).toBe("pharmacy");
    expect(matchesSearchQualifiers({
      ...openCoffee,
      category: "pharmacy",
      primary_type: "pharmacy",
      open_status: { state: "closed" },
    }, parsed)).toBe(false);
  });

  it("does not treat open mic as an open-now place filter", () => {
    const parsed = parseSearchQualifiers("open mic tonight");
    expect(parsed.openNow).toBe(false);
    expect(parsed.categoryKey).toBeNull();
  });

  it("treats downtown Frederick as an explicit location constraint", () => {
    const parsed = parseSearchQualifiers("coffee open now near downtown Frederick");
    expect(parsed.downtown).toBe(true);
    expect(parsed.openNow).toBe(true);
    expect(parsed.cleanedQuery).not.toMatch(/downtown/i);
  });

  it("removes booking instructions and requires actual steak evidence", () => {
    const parsed = parseSearchQualifiers("i want a steak dinner tonight use open table to make a rev for 7:30pm tonight");
    expect(parsed).toMatchObject({
      compoundIntent: "steak-dinner",
      categoryLabel: "a steak dinner",
      cleanedQuery: "a steak dinner",
    });
    expect(matchesSearchQualifiers({
      category: "restaurant",
      name: "Avery's Maryland Grille",
      short_blurb: "Local seafood and steak.",
      open_status: { state: "unknown" },
    }, parsed)).toBe(true);
    expect(matchesSearchQualifiers({
      category: "restaurant",
      name: "A Generic Bistro",
      short_blurb: "Dinner and cocktails.",
      open_status: { state: "unknown" },
    }, parsed)).toBe(false);
    expect(matchesSearchQualifiers({
      category: "civic",
      name: "Property zoning",
      short_blurb: "Official county information.",
      open_status: { state: "unknown" },
    }, parsed)).toBe(false);
  });
});
