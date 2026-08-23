import { describe, it, expect } from "vitest";
import { cuisinesOf, primaryCuisineOf, cuisineFacets, cuisineLabel } from "@/lib/cuisine";

describe("cuisinesOf — text signal (name + blurb)", () => {
  it("matches a cuisine word in the name", () => {
    expect(cuisinesOf({ name: "Sumittra Thai Cuisine" })).toContain("thai");
    expect(cuisinesOf({ name: "Il Porto Ristorante" })).toContain("italian");
    expect(cuisinesOf({ name: "Adele's Tex Mex" })).toContain("mexican");
  });

  it("keeps the most-specific cuisine first (primary)", () => {
    // "Mexican Grill" matches both mexican (specific) and american (grill);
    // mexican is earlier in CUISINES so it leads.
    expect(primaryCuisineOf({ name: "Azteca Mexican Grill" })).toBe("mexican");
  });

  it("falls back to category when text says nothing", () => {
    expect(cuisinesOf({ name: "Joe's", category: "restaurant" })).toEqual(["american"]);
    expect(cuisinesOf({ name: "The Spot", category: "bakery" })).toEqual(["bakery"]);
  });
});

describe("cuisinesOf — structured Google primary_type", () => {
  it("classifies a place whose NAME carries no cuisine word", () => {
    // Real dataset rows the name-only classifier missed.
    expect(cuisinesOf({ name: "Cucina Massi", primary_type: "italian_restaurant" })).toContain(
      "italian",
    );
    expect(cuisinesOf({ name: "Tin Corner", primary_type: "vietnamese_restaurant" })).toContain(
      "vietnamese",
    );
    expect(cuisinesOf({ name: "Asia Star", primary_type: "chinese_restaurant" })).toContain(
      "chinese",
    );
    expect(
      cuisinesOf({ name: "Plaza Mexico", primary_type: "mexican_restaurant" }),
    ).toContain("mexican");
  });

  it("adds a SPECIFIC structured cuisine even when the name already matched", () => {
    const out = cuisinesOf({ name: "River Bar Grill", primary_type: "mexican_restaurant" });
    expect(out).toContain("american"); // from "Grill"
    expect(out).toContain("mexican"); // from primary_type
  });

  it("does NOT let the generic american type override real ethnic tags", () => {
    // Google sometimes mislabels an Asian spot american_restaurant; the
    // name-derived tags must survive and american must not be appended.
    const out = cuisinesOf({ name: "Simply Asia Thai Chinese", primary_type: "american_restaurant" });
    expect(out).not.toContain("american");
    expect(out).toContain("thai");
  });

  it("uses the generic structured type only as a fallback", () => {
    expect(cuisinesOf({ name: "Prospect Pantry", primary_type: "american_restaurant" })).toEqual([
      "american",
    ]);
  });

  it("ignores types with no cuisine signal", () => {
    expect(cuisinesOf({ name: "Generic Eatery", primary_type: "restaurant" })).toEqual([]);
    expect(cuisinesOf({ name: "Quick Bite", primary_type: "fast_food_restaurant" })).toEqual([]);
  });

  it("maps ice cream and sandwich shops by structured type", () => {
    expect(cuisinesOf({ name: "Jimmie Cone", primary_type: "ice_cream_shop" })).toContain(
      "dessert",
    );
    expect(cuisinesOf({ name: "Jimmy John's", primary_type: "sandwich_shop" })).toContain("deli");
  });
});

describe("cuisineFacets + labels", () => {
  it("counts distinct cuisines in canonical order with labels", () => {
    const facets = cuisineFacets([
      { name: "Plaza Mexico", primary_type: "mexican_restaurant" },
      { name: "Azteca Mexican Grill" },
      { name: "Cucina Massi", primary_type: "italian_restaurant" },
    ]);
    const mex = facets.find((f) => f.slug === "mexican");
    expect(mex?.count).toBe(2);
    expect(facets.some((f) => f.slug === "italian")).toBe(true);
  });

  it("resolves a human label for a slug", () => {
    expect(cuisineLabel("japanese")).toBe("Japanese / Sushi");
    expect(cuisineLabel("unknown-slug")).toBe("unknown-slug");
  });
});
