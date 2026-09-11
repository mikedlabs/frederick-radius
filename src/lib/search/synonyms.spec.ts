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
    const bank = expandQuery("bank");
    expect(bank.terms).toContain("bank");
    expect(bank.cats).not.toContain("services");
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

  // Each of these returned ZERO or one place against the live catalog on
  // 2026-08-20 while the answer was sitting in it. Verified targets exist
  // before the rule was written: one veterinary clinic, three postal
  // counters, four early-childhood places, nine repair shops.
  it("answers the errands the catalog held but could not be asked for", () => {
    expect(expandQuery("vet").terms).toContain("veterinar");
    expect(expandQuery("mail a package").terms).toContain("post office");
    expect(expandQuery("ship a package").terms).toContain("usps");
    expect(expandQuery("daycare").terms).toContain("child_care");
    expect(expandQuery("mechanic").terms).toContain("car_repair");
  });

  // `terms` match by substring, so a bare "vet" would also fire on "velvet"
  // and "Corvette". The stem is the guard, and it must stay a stem.
  it("stems the vet rule so it cannot fire on velvet", () => {
    const terms = expandQuery("vet").terms;
    expect(terms).toContain("veterinar");
    expect(terms).not.toContain("vet");
  });

  // `services` holds 52 unrelated businesses and `family` holds bowling
  // alleys and arcades. Expanding an errand to either answers "daycare"
  // with a fun center. These rules carry evidence, not a category sweep.
  it("keeps the errand rules off the catch-all categories", () => {
    for (const q of ["vet", "daycare", "mail a package", "mechanic", "walk in clinic"]) {
      expect(expandQuery(q).cats).not.toContain("services");
      expect(expandQuery(q).cats).not.toContain("family");
      expect(expandQuery(q).cats).not.toContain("wellness");
    }
  });

  it("merges every rule a query trips", () => {
    const both = expandQuery("sushi and wings");
    expect(both.cats).toEqual(expect.arrayContaining(["restaurant", "bar"]));
    expect(both.terms).toEqual(expect.arrayContaining(["sushi", "wing"]));
  });
});
