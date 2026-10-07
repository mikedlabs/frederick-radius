import { describe, it, expect } from "vitest";
import {
  cuisinesOf,
  primaryCuisineOf,
  cuisineFacets,
  cuisineLabel,
  curatedKnownFor,
  placeTypeLabel,
} from "@/lib/cuisine";
import { CATEGORY_BY_SLUG } from "@/data/categories";

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

describe("placeTypeLabel — what a browse row says the place is", () => {
  const cat = (slug: string) => CATEGORY_BY_SLUG[slug];

  it("leads with the structured Google type instead of the plural category", () => {
    // The October 2026 audit counted "Restaurants" 183 times down one list.
    expect(placeTypeLabel({ category: "restaurant", primary_type: "barbecue_restaurant" }, cat("restaurant"))).toBe("Barbecue");
    expect(placeTypeLabel({ category: "coffee", primary_type: "coffee_shop" }, cat("coffee"))).toBe("Coffee shop");
    expect(placeTypeLabel({ category: "salon", primary_type: "barber_shop" }, cat("salon"))).toBe("Barber");
    expect(placeTypeLabel({ category: "worship", primary_type: "church" }, cat("worship"))).toBe("Church");
  });

  it("falls back to a singular category label for generic or missing types", () => {
    expect(placeTypeLabel({ category: "restaurant", primary_type: "restaurant" }, cat("restaurant"))).toBe("Restaurant");
    expect(placeTypeLabel({ category: "brewery" }, cat("brewery"))).toBe("Brewery");
    expect(placeTypeLabel({ category: "shopping", primary_type: "store" }, cat("shopping"))).toBe("Shop");
  });

  it("lets a corrected category outrank a Google type from another family", () => {
    // Orchards arrive as grocery_store; a human filed them under farms.
    expect(placeTypeLabel({ category: "agritourism", primary_type: "grocery_store" }, cat("agritourism"))).toBe("Farm");
    expect(placeTypeLabel({ category: "music", primary_type: "church" }, cat("music"))).toBe("Live music");
  });

  it("files barbers and tea shops under either neighbouring family", () => {
    expect(placeTypeLabel({ category: "services", primary_type: "barber_shop" }, cat("services"))).toBe("Barber");
    expect(placeTypeLabel({ category: "coffee", primary_type: "tea_store" }, cat("coffee"))).toBe("Tea shop");
  });

  it("keeps a category more specific than the Google type", () => {
    expect(placeTypeLabel({ category: "antiques", primary_type: "home_goods_store" }, cat("antiques"))).toBe("Antiques");
  });

  it("never reads the name, which can mislead", () => {
    // "Grill" would say American; Saffron Grill & Bar serves Indian food.
    expect(placeTypeLabel({ category: "restaurant" }, cat("restaurant"))).toBe("Restaurant");
  });
});

describe("curatedKnownFor", () => {
  it("returns the first curated phrase in sentence case", () => {
    expect(curatedKnownFor({ name: "Baker Park", known_for: ["playground and picnic tables"] })).toBe(
      "Playground and picnic tables",
    );
    expect(curatedKnownFor({ name: "White Rabbit Gastropub", known_for: ["Detroit-style pizza"] })).toBe(
      "Detroit-style pizza",
    );
  });

  it("ignores scraped blurbs and phrases that say nothing at row size", () => {
    expect(curatedKnownFor({ name: "Joe's", known_for: [] })).toBeNull();
    expect(curatedKnownFor({ name: "Joe's" })).toBeNull();
    expect(curatedKnownFor({ name: "Attaboy Beer", known_for: ["Attaboy Beer garden and garage"] })).toBeNull();
    expect(
      curatedKnownFor({ name: "X", known_for: ["a very long phrase that would never fit on one row of a list"] }),
    ).toBeNull();
  });
});
