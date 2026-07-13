import { describe, it, expect } from "vitest";
import { search } from "./search";

/**
 * Guards the natural-language relevance of the shared search core, which the
 * Ask box feeds raw ("i need a hotel"). The bug (owner catch, Jul 2026): a lone
 * "i" prefix-matched every place starting with "I", so the Ask source cards
 * were Ibiza Cafe, In Fit, Inbloom, Iglesia La Luz Del Mundo... a mixed bag
 * with one actual hotel. normalize now drops single-char + filler tokens, and a
 * lodging intent boosts the lodging category.
 */
describe("search — natural-language 'i need a hotel'", () => {
  const hits = search("i need a hotel", 8);
  const places = hits.filter((h) => h.type === "place") as Extract<
    ReturnType<typeof search>[number],
    { type: "place" }
  >[];

  it("returns at least one place", () => {
    expect(places.length).toBeGreaterThan(0);
  });

  it("leads with a lodging place, not an incidental 'I' name match", () => {
    // The top place must be lodging (the intent boost + the killed 'i' noise).
    expect(places[0]?.place.category).toBe("lodging");
  });

  it("does not surface the old junk (cafe / gym / jewelry / faith) in the top hits", () => {
    const cats = new Set(places.map((p) => p.place.category));
    for (const junk of ["cafe", "coffee", "gym", "jewelry", "faith"]) {
      expect(cats.has(junk)).toBe(false);
    }
  });
});

describe("search — normalize drops noise but keeps real keywords", () => {
  it("a plain keyword still works", () => {
    const hits = search("coffee", 5);
    expect(hits.some((h) => h.type === "place")).toBe(true);
  });

  it("filler-only queries return nothing rather than everything", () => {
    // "i need a" is pure filler + a single char -> no terms -> no hits.
    expect(search("i need a", 5)).toHaveLength(0);
  });
});
