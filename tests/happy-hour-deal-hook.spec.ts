import { describe, it, expect } from "vitest";
import { dealHook, splitDeal } from "@/lib/happyHourDeal";

// The deal hook is the AMOUNT OFF shown as a hero beside the venue name. It
// must only ever surface a number that is literally in the verified deal text
// (never invent a discount), preferring the punchiest honest hook.
describe("dealHook", () => {
  it("prefers a percentage / half-off (the punchiest hook)", () => {
    expect(dealHook("50% off all wings and $2 off full-pour drafts.")).toBe("50% OFF");
    expect(dealHook("Half off all wines by the glass.")).toBe("50% OFF");
    expect(dealHook("1/2 price wine by the bottle only, every Wednesday.")).toBe("50% OFF");
    expect(dealHook("Half-price draft beer, wine, and kombucha.")).toBe("50% OFF");
    expect(dealHook("Tue $4 craft pints and 25% off crab legs.")).toBe("25% OFF");
  });

  it("falls back to the biggest dollar discount", () => {
    expect(dealHook("$5 off all scotch and $5.50 Irish pints.")).toBe("$5 OFF");
    expect(dealHook("All tapas $7, $2 off draft and wine, $5 margaritas.")).toBe("$2 OFF");
    expect(dealHook("Daily $7 house spirits and $1 off other drinks.")).toBe("$1 OFF");
  });

  it("uses the cheapest named price, with 'FROM' only for a real range", () => {
    // 2+ distinct prices => a range => "FROM $min"
    expect(dealHook("$3 beers, $6 specialty drinks, discounted wine bottles.")).toBe("FROM $3");
    expect(dealHook("$5 16oz drafts, $6 margaritas and crushes, plus apps.")).toBe("FROM $5");
    expect(dealHook("$3.50 domestics, $4.25 house cocktails, $5 house wine.")).toBe("FROM $3.50");
    expect(dealHook("At the bar: brews $4.50, drafts $5.50, house wine $5.")).toBe("FROM $4.50");
    // a single price => the bare figure, NOT a misleading "FROM"
    expect(dealHook("$17 BBQ rib dinner.")).toBe("$17");
    expect(dealHook("$8 Smoked Bourbon Old Fashioneds on Wednesdays.")).toBe("$8");
    // single price but the text says "from" => keep "FROM"
    expect(dealHook("Pints from $5.")).toBe("FROM $5");
  });

  it("returns null when there is no number to stand behind", () => {
    expect(dealHook("Discounted wine, beer, rail and specialty cocktails.")).toBeNull();
    expect(dealHook("Happy-hour pricing on cocktails, wine, and beer.")).toBeNull();
    expect(dealHook("Food and drink specials at the bar.")).toBeNull();
    expect(dealHook("")).toBeNull();
    expect(dealHook(null)).toBeNull();
    expect(dealHook(undefined)).toBeNull();
  });

  it("does not headline a sub-$2 food side as the price hook", () => {
    // A 99-cent wing / $1 oyster is not the headline pour — fall back to null
    // (the caller shows "Specials") rather than a misleading "FROM $0.99".
    expect(dealHook("$0.99 wings and $1 oysters at the bar.")).toBeNull();
    expect(dealHook("$1 sliders during the game.")).toBeNull();
    // ...but a real $2+ drink anchor still reads as FROM.
    expect(dealHook("$2 drafts all afternoon.")).toBe("$2");
  });

  it("formats money cleanly (no trailing .00, keeps cents)", () => {
    expect(dealHook("$10 off bottles")).toBe("$10 OFF");
    expect(dealHook("Pints from $5.00")).toBe("FROM $5");
    expect(dealHook("$2.50 drafts")).toBe("$2.50");
  });
});

describe("splitDeal", () => {
  it("strips the hook's figure from the body so it's never shown twice", () => {
    expect(splitDeal("$8 Smoked Bourbon Old Fashioneds on Wednesdays."))
      .toEqual({ hook: "$8", rest: "Smoked Bourbon Old Fashioneds on Wednesdays." });
    expect(splitDeal("$17 BBQ rib dinner."))
      .toEqual({ hook: "$17", rest: "BBQ rib dinner." });
  });

  it("removes a mid-sentence percentage, not just a leading one", () => {
    expect(splitDeal("Wine Wednesday: 15% off all bottles of wine."))
      .toEqual({ hook: "15% OFF", rest: "Wine Wednesday: all bottles of wine." });
  });

  it("handles half-price phrasing and sentence-cases the remainder", () => {
    expect(splitDeal("1/2 price wine by the bottle, every Wednesday."))
      .toEqual({ hook: "50% OFF", rest: "Wine by the bottle, every Wednesday." });
  });

  it("leaves non-hook figures in the body (only the shown figure is stripped)", () => {
    // hook is the percentage; the unrelated "$4" price stays in the rest.
    const { hook, rest } = splitDeal("Tue $4 craft pints and 25% off crab legs.");
    expect(hook).toBe("25% OFF");
    expect(rest).toContain("$4 craft pints");
    expect(rest).not.toContain("25%");
  });

  it("returns the full offer when there's no figure", () => {
    expect(splitDeal("Food and drink specials at the bar."))
      .toEqual({ hook: null, rest: "Food and drink specials at the bar." });
  });

  it("keeps the full offer rather than a stub if stripping guts it", () => {
    expect(splitDeal("$5").rest).toBe("$5");
  });
});
