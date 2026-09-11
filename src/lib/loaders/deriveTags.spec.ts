import { describe, it, expect } from "vitest";
import { deriveTags } from "./places";

// Factual category → audience/feature tags. These power the rainy-day answer,
// category faceting, and search without fabricating per-place editorial claims.
describe("deriveTags", () => {
  it("marks weather-dependent categories outdoor (the rainy-day EXCLUDE set)", () => {
    for (const c of ["park", "trail", "golf", "playground", "agritourism"]) {
      expect(deriveTags(c)).toContain("outdoor");
      expect(deriveTags(c)).not.toContain("indoor");
    }
  });

  it("marks duck-in destinations indoor (the rainy-day INCLUDE set)", () => {
    for (const c of ["museum", "library", "gallery", "theater", "coffee", "bakery", "book-store"]) {
      expect(deriveTags(c)).toContain("indoor");
      expect(deriveTags(c)).not.toContain("outdoor");
    }
  });

  it("leaves ambiguous categories untouched (market is indoor grocery AND outdoor farmers-market)", () => {
    const t = deriveTags("market");
    expect(t).not.toContain("indoor");
    expect(t).not.toContain("outdoor");
  });

  it("adds kid tags for playgrounds", () => {
    const t = deriveTags("playground");
    expect(t).toEqual(expect.arrayContaining(["outdoor", "kids-0-5", "kids-6-12"]));
  });

  it("unions with curated tags, never replaces them", () => {
    const t = deriveTags("museum", ["free", "date-night"]);
    expect(t).toEqual(expect.arrayContaining(["free", "date-night", "indoor"]));
  });

  it("is a no-op for categories with no factual derivation", () => {
    expect(deriveTags("restaurant")).toEqual([]);
    expect(deriveTags("restaurant", ["dog-friendly"])).toEqual(["dog-friendly"]);
  });
});
