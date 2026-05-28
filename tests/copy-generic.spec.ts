import { describe, it, expect } from "vitest";
import { isGenericBlurb, nonGenericBlurb } from "@/lib/copy-generic";

describe("isGenericBlurb", () => {
  it("flags the discovery-pipeline placeholder shape", () => {
    expect(isGenericBlurb("Restaurants in Downtown Frederick.")).toBe(true);
    expect(isGenericBlurb("Coffee in Downtown Frederick")).toBe(true);
    expect(isGenericBlurb("Bakeries in Brunswick.")).toBe(true);
    expect(isGenericBlurb("Churches & Worship in Emmitsburg.")).toBe(true);
    expect(isGenericBlurb("Parks in Mount Airy")).toBe(true);
  });

  it("does not flag real editorial copy", () => {
    expect(isGenericBlurb("Relaxed coffee shop offering a broad menu of breakfast & sandwiches.")).toBe(false);
    expect(isGenericBlurb("Family-run place offering casual American & Middle Eastern bites.")).toBe(false);
    expect(isGenericBlurb("Espresso drinks, cafe dishes & wine in a restored church.")).toBe(false);
    // Has more than just "X in Y"
    expect(isGenericBlurb("Coffee in Downtown Frederick, since 1995.")).toBe(false);
  });

  it("handles empty / nullish inputs", () => {
    expect(isGenericBlurb(undefined)).toBe(false);
    expect(isGenericBlurb(null)).toBe(false);
    expect(isGenericBlurb("")).toBe(false);
    expect(isGenericBlurb("   ")).toBe(false);
  });

  it("nonGenericBlurb returns undefined for generic, passes through real copy", () => {
    expect(nonGenericBlurb("Restaurants in Downtown Frederick.")).toBeUndefined();
    expect(nonGenericBlurb("A great local place.")).toBe("A great local place.");
    expect(nonGenericBlurb(undefined)).toBeUndefined();
  });
});
