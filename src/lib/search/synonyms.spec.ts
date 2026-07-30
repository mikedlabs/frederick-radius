import { describe, expect, it } from "vitest";
import { expandQuery } from "./synonyms";

describe("expandQuery", () => {
  it("is a no-op for a query with no everyday-word match", () => {
    expect(expandQuery("Rockwell Brewery")).toEqual({ terms: [], cats: [] });
  });

  it("maps a spoken need onto the catalog's category", () => {
    expect(expandQuery("prescription").cats).toContain("pharmacy");
    expect(expandQuery("sunday service").cats).toContain("worship");
    expect(expandQuery("a show").cats).toContain("theater");
  });

  it("carries topic evidence for needs that live inside a broad category", () => {
    const bbq = expandQuery("barbecue");
    expect(bbq.cats).toContain("restaurant");
    expect(bbq.terms).toContain("brisket");
  });

  it("matches single words on token boundaries, not substrings", () => {
    // "banking" must not fire the bank rule; "showroom" must not fire "a show".
    expect(expandQuery("banking").cats).toEqual([]);
    expect(expandQuery("showroom").cats).toEqual([]);
    expect(expandQuery("bank").cats).toContain("services");
  });

  it("still matches multi-word needs as phrases inside a sentence", () => {
    expect(expandQuery("is there somewhere to study nearby").cats).toContain("coffee");
    expect(expandQuery("where can i get a prescription filled").cats).toContain("pharmacy");
  });

  it("does not use the category's own name as topic evidence", () => {
    // "market" as a term outranked distance on "closest grocery store";
    // the category hit carries that need instead.
    expect(expandQuery("grocery store").terms).not.toContain("market");
    expect(expandQuery("grocery store").cats).toContain("market");
  });

  it("merges every rule a query trips", () => {
    const both = expandQuery("sushi and wings");
    expect(both.cats).toEqual(expect.arrayContaining(["restaurant", "bar"]));
    expect(both.terms).toEqual(expect.arrayContaining(["sushi", "wing"]));
  });
});
