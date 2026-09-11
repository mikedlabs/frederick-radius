import { describe, it, expect } from "vitest";
import { bestCraving, cravingToWant, dominantCraving, savedTasteWant } from "./saved-taste";
import type { CravingMatchable } from "@/data/cravings";

type P = CravingMatchable & { slug: string };
const coffee = (slug: string, name: string): P => ({ slug, category: "coffee", name });
const brewery = (slug: string, name: string): P => ({ slug, category: "brewery", name });
const park = (slug: string, name: string): P => ({ slug, category: "park", name });

describe("bestCraving — most specific noun wins", () => {
  it("reads a coffee shop as coffee, a taproom as breweries", () => {
    expect(bestCraving(coffee("c", "Dublin Roasters"))).toBe("coffee");
    expect(bestCraving(brewery("b", "Brewer's Alley"))).toBe("breweries");
  });
});

describe("cravingToWant — craving → 'I want…' main category", () => {
  it("groups the specific nouns under the intent tapped", () => {
    expect(cravingToWant("coffee")).toBe("eat");
    expect(cravingToWant("food")).toBe("eat");
    expect(cravingToWant("breweries")).toBe("drink");
    expect(cravingToWant("wineries")).toBe("drink");
    expect(cravingToWant("outside")).toBe("outdoors");
    expect(cravingToWant("golf")).toBe("outdoors");
    expect(cravingToWant("music")).toBe("seedo");
    expect(cravingToWant("art")).toBe("seedo");
    expect(cravingToWant("shops")).toBe("shop");
    expect(cravingToWant("wellness")).toBe("unwind");
    expect(cravingToWant("stay")).toBe("seedo");
  });

  it("returns null for a craving with no main (never guesses)", () => {
    expect(cravingToWant("nonsense")).toBeNull();
  });
});

describe("dominantCraving — plurality across the LIVE saved set", () => {
  const places = [
    coffee("c1", "Dublin Roasters"),
    coffee("c2", "Frederick Coffee Co"),
    coffee("c3", "Gravel & Grind"),
    brewery("b1", "Brewer's Alley"),
  ];

  it("finds the coffee plurality", () => {
    const top = dominantCraving(places, new Set(["c1", "c2", "c3", "b1"]));
    expect(top).toMatchObject({ key: "coffee", n: 3, matched: 4 });
  });

  it("only counts places in the saved set (intersect)", () => {
    // c3 is present in the fetched list but NOT saved — must not be tallied.
    const top = dominantCraving(places, new Set(["c1", "c2", "b1"]));
    expect(top).toMatchObject({ key: "coffee", n: 2, matched: 3 });
  });

  it("returns null below the minimum matched (no real pattern)", () => {
    expect(dominantCraving(places, new Set(["b1"]))).toBeNull();
  });

  it("returns null without a clear plurality (three-way split)", () => {
    const split = [coffee("c1", "Dublin Roasters"), brewery("b1", "Brewer's Alley"), park("p1", "Baker Park")];
    expect(dominantCraving(split, new Set(["c1", "b1", "p1"]))).toBeNull();
  });
});

describe("savedTasteWant — the default drawer to open, or null to fall back", () => {
  const places = [
    coffee("c1", "Dublin Roasters"),
    coffee("c2", "Frederick Coffee Co"),
    coffee("c3", "Gravel & Grind"),
    brewery("b1", "Brewer's Alley"),
  ];

  it("a coffee-heavy saved list opens Eat", () => {
    expect(savedTasteWant(places, new Set(["c1", "c2", "c3", "b1"]))).toBe("eat");
  });

  it("a brewery-heavy saved list opens Drink", () => {
    const beer = [brewery("b1", "Brewer's Alley"), brewery("b2", "Attaboy"), brewery("b3", "Rockwell"), coffee("c1", "Dublin Roasters")];
    expect(savedTasteWant(beer, new Set(["b1", "b2", "b3", "c1"]))).toBe("drink");
  });

  it("falls back to null with no saves", () => {
    expect(savedTasteWant([], new Set())).toBeNull();
  });
});
