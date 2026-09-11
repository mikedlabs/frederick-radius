import { describe, it, expect } from "vitest";
import { dealClauses, figureCount, emphasizeFigures, splitDeal, dealQuality } from "./happyHourDeal";

describe("dealClauses — glue every figure to what it's for", () => {
  it("splits a multi-figure deal into self-contained clauses", () => {
    expect(
      dealClauses("Tue $4 craft pints and 25% off crab legs, Wed crab specials, Thu $1 oysters."),
    ).toEqual(["Tue $4 craft pints", "25% off crab legs", "Wed crab specials", "Thu $1 oysters"]);
  });

  it("never truncates mid-sentence (the black-hog bug)", () => {
    expect(dealClauses("Full slab of ribs with one side for $25, plus 8 wings for $10.")).toEqual([
      "Full slab of ribs with one side for $25",
      "8 wings for $10",
    ]);
  });

  it("keeps 'and' joining a shared subject whole ('draft and wine')", () => {
    expect(dealClauses("All tapas $7, $2 off draft and wine, $5 margaritas and sangria.")).toEqual([
      "All tapas $7",
      "$2 off draft and wine",
      "$5 margaritas and sangria",
    ]);
  });

  it("splits 'and' only when the next clause starts a fresh figure", () => {
    expect(dealClauses("$5 off all scotch and $5.50 Irish pints.")).toEqual([
      "$5 off all scotch",
      "$5.50 Irish pints",
    ]);
  });

  it("returns the whole text for a single figureless special", () => {
    expect(dealClauses("Food and drink specials")).toEqual(["Food and drink specials"]);
  });

  it("returns [] for empty input", () => {
    expect(dealClauses("")).toEqual([]);
    expect(dealClauses(null)).toEqual([]);
  });
});

describe("figureCount — single vs multi discount", () => {
  it("counts a lone figure", () => {
    expect(figureCount("50% off all wings")).toBe(1);
    expect(figureCount("$5 margaritas")).toBe(1);
  });
  it("counts every figure in a multi-part deal", () => {
    expect(figureCount("$5 cocktail, $2 off wine, $4 drafts")).toBe(3);
    expect(figureCount("drafts around $6-$7")).toBe(2);
  });
  it("is zero for a figureless special", () => {
    expect(figureCount("Food and drink specials")).toBe(0);
  });
});

describe("emphasizeFigures — figure highlighted in place, word order preserved", () => {
  it("marks the figure and keeps the subject attached", () => {
    expect(emphasizeFigures("$4 craft pints")).toEqual([
      { text: "$4", figure: true },
      { text: " craft pints", figure: false },
    ]);
  });
  it("marks a percent-off figure", () => {
    expect(emphasizeFigures("25% off crab legs")).toEqual([
      { text: "25% off", figure: true },
      { text: " crab legs", figure: false },
    ]);
  });
  it("handles a figure that trails the subject", () => {
    expect(emphasizeFigures("8 wings for $10")).toEqual([
      { text: "8 wings for ", figure: false },
      { text: "$10", figure: true },
    ]);
  });
});

describe("dealQuality — clarity tiers (the primary ranking key)", () => {
  it("ranks a percentage off highest (tier 4)", () => {
    expect(dealQuality("50% off all wings")).toBe(4);
    expect(dealQuality("half-price appetizers")).toBe(4);
  });
  it("ranks a dollar discount below percent (tier 3)", () => {
    expect(dealQuality("$5 off all scotch")).toBe(3);
  });
  it("ranks a concrete price (tier 2)", () => {
    expect(dealQuality("$8 personal pizza")).toBe(2);
    expect(dealQuality("$5 select beers, $7 cocktails")).toBe(2); // FROM $5
  });
  it("ranks a sub-hook figure (tier 1)", () => {
    expect(dealQuality("Oysters $1 each")).toBe(1); // figure present, floored below a $2 hook
  });
  it("ranks a figureless/vague deal lowest (tier 0)", () => {
    expect(dealQuality("Food and drink specials at the bar")).toBe(0);
    expect(dealQuality("")).toBe(0);
    expect(dealQuality(null)).toBe(0);
  });
  it("never lets a vague deal out-rank a figure-bearing one", () => {
    expect(dealQuality("Restaurant-wide food and drink specials")).toBeLessThan(
      dealQuality("$2 off beer"),
    );
  });
});

describe("splitDeal still works for the single-figure case", () => {
  it("extracts a clean hook + subject", () => {
    expect(splitDeal("50% off all wings")).toEqual({ hook: "50% OFF", rest: "All wings" });
  });
});
