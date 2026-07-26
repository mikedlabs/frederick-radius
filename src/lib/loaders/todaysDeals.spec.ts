import { describe, it, expect } from "vitest";
import { distillOffer, stripProvenance } from "./todaysDeals";

describe("stripProvenance", () => {
  it("removes a trailing balanced source note", () => {
    expect(
      stripProvenance("1/2 price wine by the bottle only. Every Wednesday (stated on the official bar page)"),
    ).toBe("1/2 price wine by the bottle only. Every Wednesday");
  });

  it("removes a trailing note and its orphaned comma", () => {
    expect(
      stripProvenance("$8 Smoked Bourbon Old Fashioneds, (this is their stated Wednesday happy-hour/Game Night special)"),
    ).toBe("$8 Smoked Bourbon Old Fashioneds");
  });

  it("removes a trailing note even when a sentence period follows it (the shipped Field Notes shape)", () => {
    expect(
      stripProvenance("1/2 price wine by the bottle only, every Wednesday (stated on the official bar page)."),
    ).toBe("1/2 price wine by the bottle only, every Wednesday");
    expect(
      stripProvenance("Wednesdays: $8 Smoked Bourbon Old Fashioneds, 2-10 PM (this is their stated Wednesday happy-hour/Game Night special)."),
    ).toBe("Wednesdays: $8 Smoked Bourbon Old Fashioneds, 2-10 PM");
    expect(
      stripProvenance("$2 off draft beers during happy hour (stated on the official site)."),
    ).toBe("$2 off draft beers during happy hour");
  });

  it("removes a truncated, unclosed trailing parenthetical", () => {
    expect(stripProvenance("A new Monthly Wine Dinner (officially announced")).toBe(
      "A new Monthly Wine Dinner",
    );
  });

  it("keeps a legit mid-phrase parenthetical", () => {
    expect(stripProvenance("$5 drafts (all IPAs) 5-9 PM")).toBe("$5 drafts (all IPAs) 5-9 PM");
  });

  it("collapses multiple stacked trailing notes", () => {
    expect(stripProvenance("Half-price apps (per server) (source: site)")).toBe("Half-price apps");
  });

  it("leaves clean copy untouched", () => {
    expect(stripProvenance("$4 pints all day")).toBe("$4 pints all day");
  });
});

// Inputs mirror what the wallet actually hands distillOffer: the offer AFTER
// trimDay + stripHours, i.e. the exact strings the Jul-9 audit caught
// truncating mid-thought at the card lip.
describe("distillOffer", () => {
  it("strips an embedded day-list and keeps the essence before the colon (Rube's AYCE)", () => {
    expect(
      distillOffer(
        "Nightly AYCE Crabs special Tuesday, Wednesday, and Thursday: all-you-can-eat soup & salad bar, french fries, and fresh hot steamed crabs",
      ),
    ).toEqual({ headline: "Nightly AYCE Crabs special", terms: undefined });
  });

  it("lifts a terms parenthetical into the lip fact (Belles wings)", () => {
    expect(distillOffer("Buffalo wing special, (eat-in only); $4 flavored vodkas")).toEqual({
      headline: "Buffalo wing special",
      terms: "Eat-in only",
    });
  });

  it("drops an 'every <day>' schedule and the trailing elaboration (trivia night)", () => {
    expect(
      distillOffer(
        "Trivia Night every Thursday, (Geeks Who Drink). Winner gets free beer and bragging rights, plus an occasional special prize.",
      ).headline,
    ).toBe("Trivia Night");
  });

  it("removes a non-terms parenthetical from the headline (burger and a beer)", () => {
    expect(distillOffer("Burger and a beer (or tots) special.").headline).toBe(
      "Burger and a beer special",
    );
  });

  it("keeps a single mid-phrase brand day ('Crabby Wednesday') and cuts at the colon", () => {
    expect(
      distillOffer("Crabby Wednesday: discount on hardshell crabs by the dozen, with an all-you-can-eat option.")
        .headline,
    ).toBe("Crabby Wednesday");
  });

  it("cuts an over-long clause at a natural boundary, never mid-word", () => {
    expect(
      distillOffer("Team Trivia with 1/2 price appetizers and extended happy hour until close; prizes for the top 3 teams.")
        .headline,
    ).toBe("Team Trivia with 1/2 price appetizers");
    expect(
      distillOffer("Oysters $1.25 each raw and steamed, $1.50 each fried.").headline,
    ).toBe("Oysters $1.25 each raw and steamed");
  });

  it("keeps service details in the full offer instead of the scan headline", () => {
    expect(
      distillOffer(
        "All-You-Can-Eat hard shell crab specials served Tue-Fri starting at open",
      ).headline,
    ).toBe("All-You-Can-Eat hard shell crab specials");
    expect(
      distillOffer(
        "$10 off all bottles of wine throughout the restaurant, plus $2 off beer",
      ).headline,
    ).toBe("$10 off all bottles of wine");
  });

  it("leaves a short clean offer untouched", () => {
    expect(distillOffer("$4 pints")).toEqual({ headline: "$4 pints", terms: undefined });
  });

  it("falls back to the raw clause when stripping would gut the text", () => {
    expect(distillOffer("Every Thursday").headline).toBe("Every Thursday");
  });
});
