import { describe, it, expect } from "vitest";
import { wellnessCategoryFix } from "@/data/places";

/**
 * DFP mis-buckets wellness/fitness as "shopping". The fixer must move
 * the obvious ones to wellness/yoga, only when the source category is
 * "shopping", and never touch genuine shops or already-correct rows.
 */
describe("wellnessCategoryFix", () => {
  it("moves mis-bucketed fitness/wellness shops to wellness", () => {
    expect(wellnessCategoryFix("Odin Crossfit", "shopping")).toBe("wellness");
    expect(wellnessCategoryFix("Sho Lung Dojo Martial Arts", "shopping")).toBe("wellness");
    expect(wellnessCategoryFix("Dream Kicks Taekwondo", "shopping")).toBe("wellness");
    expect(wellnessCategoryFix("Illuminate Wellness", "shopping")).toBe("wellness");
    expect(wellnessCategoryFix("Unwind Massage Therapy and Wellness Studio", "shopping")).toBe("wellness");
  });

  it("routes yoga/pilates/barre to the yoga subcategory", () => {
    expect(wellnessCategoryFix("Briq Haus Pilates", "shopping")).toBe("yoga");
    expect(wellnessCategoryFix("Dancing Bear Yoga", "shopping")).toBe("yoga");
  });

  it("only acts on shopping rows; leaves correct categories alone", () => {
    expect(wellnessCategoryFix("Odin Crossfit", "wellness")).toBe("wellness");
    expect(wellnessCategoryFix("Some Yoga Studio", "restaurant")).toBe("restaurant");
  });

  it("does not grab genuine shops", () => {
    expect(wellnessCategoryFix("Dancing Bear Toys and Games", "shopping")).toBe("shopping");
    expect(wellnessCategoryFix("North Market Pop Shop", "shopping")).toBe("shopping");
    expect(wellnessCategoryFix("Gymboree Play", "shopping")).toBe("shopping");
  });
});
