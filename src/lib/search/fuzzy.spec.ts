import { describe, expect, it } from "vitest";
import { FUZZY_THRESHOLD, fuzzyNameScore, trigramSimilarity } from "./fuzzy";

describe("trigramSimilarity", () => {
  it("scores identical words as 1", () => {
    expect(trigramSimilarity("brewery", "brewery")).toBe(1);
  });

  it("scores unrelated words near 0", () => {
    expect(trigramSimilarity("brewery", "playground")).toBeLessThan(0.1);
  });

  it("catches a one-letter transposition at the pg_trgm threshold", () => {
    expect(trigramSimilarity("brewrey", "brewery")).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);
  });

  it("is case-insensitive and folds diacritics", () => {
    expect(trigramSimilarity("CAFÉ", "cafe")).toBe(1);
  });

  it("returns 0 for empty or symbol-only input", () => {
    expect(trigramSimilarity("", "brewery")).toBe(0);
    expect(trigramSimilarity("!!!", "brewery")).toBe(0);
  });
});

describe("fuzzyNameScore", () => {
  it("finds a misspelled word inside a longer name", () => {
    expect(fuzzyNameScore("brewrey", "Rockwell Brewery")).toBeGreaterThanOrEqual(
      FUZZY_THRESHOLD,
    );
  });

  it("handles the classic town typos", () => {
    expect(fuzzyNameScore("thurmount", "Thurmont")).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);
    expect(fuzzyNameScore("fredrick", "Frederick")).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);
  });

  it("requires every query word to land somewhere", () => {
    // "carrol creek": both words should map onto "Carroll Creek Linear Park".
    expect(fuzzyNameScore("carrol creek", "Carroll Creek Linear Park")).toBeGreaterThanOrEqual(
      FUZZY_THRESHOLD,
    );
    // A query where one word matches and one is noise scores lower than
    // the single matching word alone.
    expect(fuzzyNameScore("carrol xylophone", "Carroll Creek Linear Park")).toBeLessThan(
      fuzzyNameScore("carrol", "Carroll Creek Linear Park"),
    );
  });

  it("does not fire on a genuinely different name", () => {
    expect(fuzzyNameScore("brewrey", "Dancing Bear Toys and Games")).toBeLessThan(
      FUZZY_THRESHOLD,
    );
  });
});
