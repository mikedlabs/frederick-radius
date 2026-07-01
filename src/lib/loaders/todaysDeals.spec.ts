import { describe, it, expect } from "vitest";
import { stripProvenance } from "./todaysDeals";

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
