import { describe, expect, it } from "vitest";

import {
  greatFrederickFair2026Vendors as vendors,
  type FairVendorProfile,
} from "@/data/fair/great-frederick-fair-2026-vendors";
import { searchFairVendors } from "./vendor-discovery";

const jointPizzaId = "vendor-white-rabbit-rad-pies";

function resultIds(query: string): string[] {
  return searchFairVendors(vendors, query).map((vendor) => vendor.id);
}

describe("searchFairVendors", () => {
  it.each([
    "White Rabbit x Rad Pies",
    "wHiTe RaBbIt",
    "RadPies",
    "Rád Píes",
    "White-Rabbit",
    "In Crust We Trust",
  ])("finds the joint pizza exhibitor by name or alias: %s", (query) => {
    expect(resultIds(query)).toEqual([jointPizzaId]);
  });

  it("normalizes apostrophes without requiring a matching punctuation style", () => {
    expect(resultIds("BIG PAPI’S TACOS")).toEqual(["vendor-big-papis-tacos"]);
  });

  it.each(["587", "588", "587 / 588"])(
    "returns one joint exhibitor for the published pizza booth reference: %s",
    (query) => {
      expect(resultIds(query)).toEqual([jointPizzaId]);
    },
  );

  it("requires every token but allows them across reviewed fields and in any order", () => {
    expect(resultIds("588   Detroit rad")).toEqual([jointPizzaId]);
    expect(resultIds("county beef Boxcar")).toEqual(["vendor-boxcar-burgers"]);
    expect(resultIds("rad pies seafood")).toEqual([]);
  });

  it.each(["", "   \n\t ", "!!!"])(
    "returns a new array in editorial order when the query has no searchable tokens: %j",
    (query) => {
      const result = searchFairVendors(vendors, query);
      expect(result).toEqual(vendors);
      expect(result).not.toBe(vendors);
    },
  );

  it("does not mutate the input array or vendor records while filtering and ranking", () => {
    const input = structuredClone(vendors);
    const before = structuredClone(input);
    Object.freeze(input);

    searchFairVendors(input, "pizza");
    searchFairVendors(input, "drinks");
    searchFairVendors(input, "");

    expect(input).toEqual(before);
  });

  it("ranks exact names and aliases first, preserving editorial order for ties", () => {
    const profile = (
      id: string,
      fields: Partial<FairVendorProfile>,
    ): FairVendorProfile => ({
      ...vendors[0],
      id,
      name: "Example vendor",
      searchAliases: [],
      highlights: [],
      summary: "A reviewed example vendor.",
      ...fields,
    });
    const input = [
      profile("vendor-text", { summary: "This business makes cider." }),
      profile("vendor-partial-alias", { searchAliases: ["Cider drinks"] }),
      profile("vendor-partial-name", { name: "Cider makers" }),
      profile("vendor-exact-alias", { searchAliases: ["Cider"] }),
      profile("vendor-exact-name", { name: "Cider" }),
    ];

    expect(searchFairVendors(input, "cider").map((vendor) => vendor.id)).toEqual([
      "vendor-exact-alias",
      "vendor-exact-name",
      "vendor-partial-name",
      "vendor-partial-alias",
      "vendor-text",
    ]);
  });

  it("returns no results for unknown terms or an empty vendor collection", () => {
    expect(resultIds("unlistedvendor987654")).toEqual([]);
    expect(searchFairVendors([], "pizza")).toEqual([]);
  });
});
