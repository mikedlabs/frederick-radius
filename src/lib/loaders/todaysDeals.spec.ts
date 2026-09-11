import { describe, it, expect } from "vitest";
import {
  allDeals,
  daysInText,
  dealHoursForDay,
  dealOfferForDay,
  distillOffer,
  extractHoursForDay,
  stripProvenance,
} from "./todaysDeals";

describe("weekday normalization", () => {
  it("recognizes plural weekday names", () => {
    expect([...daysInText("Wednesdays and Saturdays")]).toEqual([3, 6]);
  });

  it("expands weekday ranges inclusively", () => {
    expect([...daysInText("Tue-Fri")]).toEqual([2, 3, 4, 5]);
    expect([...daysInText("Friday through Monday")]).toEqual([5, 6, 0, 1]);
  });
});

describe("selected-day deal details", () => {
  it("isolates the relevant clause from a compound multi-day offer", () => {
    const monkey = allDeals().find((row) => row.name === "Monkey Lala");
    expect(monkey).toBeDefined();

    expect(dealOfferForDay(monkey!, 2)).toContain("$4 craft draft pints");
    expect(dealOfferForDay(monkey!, 2)).not.toContain("Shares Avery's");
    expect(dealOfferForDay(monkey!, 2)).not.toContain("$1 oysters");
    expect(dealOfferForDay(monkey!, 3)).toContain("Crabby Wednesday");
    expect(dealOfferForDay(monkey!, 3)).not.toContain("$4 craft draft pints");
    expect(dealOfferForDay(monkey!, 3)).not.toContain("$1 oysters");
    expect(dealOfferForDay(monkey!, 4)).toContain("$1 oysters");
    expect(dealOfferForDay(monkey!, 4)).not.toContain("Crabby Wednesday");
  });

  it("keeps different timing for weekday and weekend clauses", () => {
    const source =
      "All-You-Can-Eat crabs served Tue-Fri starting at 3 PM, and Sat & Sun starting at open.";
    expect(extractHoursForDay(source, 2)).toBe("3 PM");
    expect(extractHoursForDay(source, 3)).toBe("3 PM");
    expect(extractHoursForDay(source, 5)).toBe("3 PM");
    expect(extractHoursForDay(source, 6)).toBe("At open");
    expect(extractHoursForDay(source, 0)).toBe("At open");
  });

  it("ships correct per-day timing without replacing the complete source offer", () => {
    const rube = allDeals().find((row) =>
      row.source_url?.includes("all-you-can-eat-specials"),
    );
    expect(rube).toBeDefined();
    expect(rube!.days).toEqual([0, 2, 3, 4, 5, 6]);
    expect(dealHoursForDay(rube!, 2)).toBe("3 PM");
    expect(dealHoursForDay(rube!, 5)).toBe("3 PM");
    expect(dealHoursForDay(rube!, 6)).toBe("At open");
    expect(dealHoursForDay(rube!, 0)).toBe("At open");
    expect(rube!.hours).toBeUndefined();
    expect(rube!.fullOffer).toContain("Tue-Fri starting at 3 PM");
    expect(rube!.fullOffer).toContain("Sat & Sun starting at open");
    expect(rube!.source_url).toBe(
      "https://rubescrabshack.com/all-you-can-eat-specials",
    );
  });

  it("moves plural weekday deals out of the standing shelf", () => {
    const teachers = allDeals().find((row) =>
      row.fullOffer.includes("Teachers get happy hour pricing"),
    );
    expect(teachers?.days).toEqual([3]);
    expect(dealHoursForDay(teachers!, 3)).toBe("All day");
  });
});

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
