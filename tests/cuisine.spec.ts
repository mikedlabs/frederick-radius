import { describe, it, expect } from "vitest";
import {
  cuisinesOf,
  primaryCuisineOf,
  cuisineFacets,
  knownFor,
  cuisineLabel,
} from "@/lib/cuisine";

describe("cuisinesOf / primaryCuisineOf", () => {
  it("derives cuisine from the name", () => {
    expect(primaryCuisineOf({ name: "Sumittra Thai Cuisine" })).toBe("thai");
    expect(primaryCuisineOf({ name: "Il Porto Restaurant" })).toBe("italian");
    expect(primaryCuisineOf({ name: "Roros Mexican Grill and Cantina" })).toBe("mexican");
    expect(primaryCuisineOf({ name: "Frederick Coffee Co Cafe" })).toBe("coffee");
    expect(primaryCuisineOf({ name: "Stone Hearth Bakery" })).toBe("bakery");
    expect(primaryCuisineOf({ name: "Idiom Brewing Company" })).toBe("brewery");
  });

  it("derives cuisine from the blurb when the name is generic", () => {
    expect(
      primaryCuisineOf({ name: "Isabella's", short_blurb: "Spanish tapas, paella, and sangria in a warm room." }),
    ).toBe("spanish");
    expect(
      primaryCuisineOf({ name: "Ayse", short_blurb: "Turkish meze, lamb kebabs, and raki on the patio." }),
    ).toBe("mediterranean");
  });

  it("falls back to the corrected category so nothing vanishes", () => {
    expect(primaryCuisineOf({ name: "Joe's Place", category: "restaurant" })).toBe("american");
    expect(primaryCuisineOf({ name: "The Spot", category: "coffee" })).toBe("coffee");
    expect(primaryCuisineOf({ name: "Unknownville" })).toBe(null);
  });

  it("can carry more than one tag, most-specific first", () => {
    const c = cuisinesOf({ name: "Black Hog BBQ Bar & Grill" });
    expect(c[0]).toBe("bbq");
    expect(c).toContain("american");
  });

  it("has a human label for every slug", () => {
    expect(cuisineLabel("thai")).toBe("Thai");
    expect(cuisineLabel("japanese")).toBe("Japanese / Sushi");
  });
});

describe("cuisineFacets", () => {
  it("returns present cuisines in canonical order with counts", () => {
    const facets = cuisineFacets([
      { name: "Sumittra Thai Cuisine" },
      { name: "Bangkok Thai" },
      { name: "Il Porto Restaurant" },
      { name: "Frederick Coffee Co Cafe" },
    ]);
    const thai = facets.find((f) => f.slug === "thai");
    expect(thai?.count).toBe(2);
    expect(facets.some((f) => f.slug === "italian")).toBe(true);
    expect(facets.some((f) => f.slug === "coffee")).toBe(true);
    // canonical order: italian (index 0) precedes thai (index 2)
    const idxIt = facets.findIndex((f) => f.slug === "italian");
    const idxThai = facets.findIndex((f) => f.slug === "thai");
    expect(idxIt).toBeLessThan(idxThai);
  });
});

describe("knownFor", () => {
  it("returns a real descriptive blurb", () => {
    expect(
      knownFor({ name: "Isabella's", short_blurb: "Spanish tapas, paella, and sangria in a warm South Market room." }),
    ).toMatch(/tapas/);
  });

  it("rejects DFP boilerplate and filler", () => {
    expect(knownFor({ name: "Il Porto", short_blurb: "More info about Il Porto · 200 S Market St" })).toBe(null);
    expect(knownFor({ name: "X", short_blurb: "Spot · 12 E Main St" })).toBe(null);
    expect(knownFor({ name: "Y", short_blurb: "Good" })).toBe(null);
    expect(knownFor({ name: "Z" })).toBe(null);
  });

  it("strips DFP name echo and rejects address-only remainders", () => {
    // Name repeated twice then an address → nothing descriptive left.
    expect(
      knownFor({
        name: "Sumittra Thai Cuisine",
        short_blurb: "Sumittra Thai Cuisine Sumittra Thai Cuisine 12 E Patrick St",
      }),
    ).toBe(null);
    // Name echoed once then real info → keep the info, drop the echo.
    expect(
      knownFor({
        name: "Cafe Nola",
        short_blurb: "Cafe Nola They have bands sometimes on the weekends and are sometimes open",
      }),
    ).toBe("They have bands sometimes on the weekends and are sometimes open");
  });
});
