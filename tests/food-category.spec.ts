import { describe, it, expect } from "vitest";
import { foodCategoryFix } from "@/data/places";

/**
 * DFP mis-buckets a large number of restaurants, cafes, bakeries, bars,
 * and breweries as "shopping" — the single biggest reason the Radius
 * tool was not showing the full food set. The fixer must recover the
 * obvious ones to the right food subcategory, only when the source
 * category is "shopping", with a strong name signal, and never grab a
 * non-food business whose name happens to contain a food-ish word.
 */
describe("foodCategoryFix", () => {
  it("recovers obvious restaurants from shopping", () => {
    expect(foodCategoryFix("Il Porto Restaurant", "shopping")).toBe("restaurant");
    expect(foodCategoryFix("Cafe 611 Restaurant", "shopping")).toBe("restaurant");
    expect(foodCategoryFix("Roros Mexican Grill and Cantina", "shopping")).toBe("restaurant");
    expect(foodCategoryFix("Black Hog BBQ Bar", "shopping")).toBe("restaurant");
    expect(foodCategoryFix("Gourmet Restaurant", "shopping")).toBe("restaurant");
    expect(foodCategoryFix("Sumittra Thai Cuisine", "shopping")).toBe("restaurant");
  });

  it("routes to the right food subcategory", () => {
    expect(foodCategoryFix("Stone Hearth Bakery", "shopping")).toBe("bakery");
    expect(foodCategoryFix("Frederick Coffee Co Cafe", "shopping")).toBe("coffee");
    expect(foodCategoryFix("Idiom Brewing Company", "shopping")).toBe("brewery");
    expect(foodCategoryFix("Olde Towne Pizzeria", "shopping")).toBe("pizza");
    expect(foodCategoryFix("The Tasting Room Wine Bar", "shopping")).toBe("bar");
  });

  it("only acts on shopping rows; leaves correct categories alone", () => {
    expect(foodCategoryFix("Il Porto Restaurant", "restaurant")).toBe("restaurant");
    expect(foodCategoryFix("Some Diner", "coffee")).toBe("coffee");
  });

  it("does not grab non-food businesses with food-ish names", () => {
    expect(foodCategoryFix("Carefree Kitchens Inc", "shopping")).toBe("shopping");
    expect(foodCategoryFix("Frederick Kitchen & Bath", "shopping")).toBe("shopping");
    expect(foodCategoryFix("Premier Cabinet & Countertop", "shopping")).toBe("shopping");
    expect(foodCategoryFix("Main Street Salon", "shopping")).toBe("shopping");
    expect(foodCategoryFix("Curated Consignment Boutique", "shopping")).toBe("shopping");
  });
});
