import { describe, it, expect } from "vitest";
import { wellnessCategoryFix } from "@/data/places";

/**
 * DFP mis-buckets personal-care + fitness businesses as "shopping". The fixer
 * moves the obvious ones into the finer wellness subcategories (massage /
 * yoga & fitness / salon / spa / wellness catch-all) so a visitor can browse
 * to a massage or a haircut instead of scanning one giant "Wellness" list.
 * Only when the source category is "shopping"; never a genuine shop.
 */
describe("wellnessCategoryFix", () => {
  it("routes massage to its own category", () => {
    expect(wellnessCategoryFix("Unwind Massage Therapy and Wellness Studio", "shopping")).toBe("massage");
    expect(wellnessCategoryFix("Pain Management Massage Studio", "shopping")).toBe("massage");
  });

  it("routes yoga / fitness / martial arts to the yoga & fitness subcategory", () => {
    expect(wellnessCategoryFix("Briq Haus Pilates", "shopping")).toBe("yoga");
    expect(wellnessCategoryFix("Dancing Bear Yoga", "shopping")).toBe("yoga");
    expect(wellnessCategoryFix("Odin Crossfit", "shopping")).toBe("yoga");
    expect(wellnessCategoryFix("Sho Lung Dojo Martial Arts", "shopping")).toBe("yoga");
    expect(wellnessCategoryFix("Dream Kicks Taekwondo", "shopping")).toBe("yoga");
  });

  it("routes salons, barbers, and nail studios to the salon subcategory", () => {
    expect(wellnessCategoryFix("Best Kept Secret Hair Salon", "shopping")).toBe("salon");
    expect(wellnessCategoryFix("Wastler's Barber Shop", "shopping")).toBe("salon");
    // The salon signal anchors even when the name also says "spa".
    expect(wellnessCategoryFix("Verbena Salon Spa", "shopping")).toBe("salon");
  });

  it("routes day spas and medspas to the spa subcategory", () => {
    expect(wellnessCategoryFix("Le Bijoux Day Spa", "shopping")).toBe("spa");
    expect(wellnessCategoryFix("Crystallume Medspa", "shopping")).toBe("spa");
  });

  it("keeps chiropractic / acupuncture / general wellness in the catch-all", () => {
    expect(wellnessCategoryFix("Arise Chiropractic Wellness Center", "shopping")).toBe("wellness");
    expect(wellnessCategoryFix("Illuminate Wellness", "shopping")).toBe("wellness");
  });

  it("only acts on shopping rows; leaves correct categories alone", () => {
    expect(wellnessCategoryFix("Odin Crossfit", "wellness")).toBe("wellness");
    expect(wellnessCategoryFix("Some Yoga Studio", "restaurant")).toBe("restaurant");
  });

  it("does not grab genuine shops", () => {
    expect(wellnessCategoryFix("Dancing Bear Toys and Games", "shopping")).toBe("shopping");
    expect(wellnessCategoryFix("North Market Pop Shop", "shopping")).toBe("shopping");
    // "Gymboree" is not a word-boundary match for "gym".
    expect(wellnessCategoryFix("Gymboree Play", "shopping")).toBe("shopping");
  });
});
