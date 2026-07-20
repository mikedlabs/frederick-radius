import { describe, it, expect } from "vitest";
import { ALL_BEERS } from "@/data/beers";
import {
  abvFraction,
  buildFieldRows,
  FLAVOR_INSIGHTS,
  ABV_MIN,
  ABV_MAX,
} from "./flavor-field";

describe("abvFraction", () => {
  it("maps the scale endpoints to 0 and 1 and clamps beyond", () => {
    expect(abvFraction(ABV_MIN)).toBeCloseTo(0);
    expect(abvFraction(ABV_MAX)).toBeCloseTo(1);
    expect(abvFraction(0)).toBe(0);
    expect(abvFraction(99)).toBe(1);
  });
});

describe("buildFieldRows", () => {
  const rows = buildFieldRows();

  it("has the nine families sorted by count descending, IPA first", () => {
    expect(rows).toHaveLength(9);
    expect(rows[0].key).toBe("ipa");
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].count).toBeGreaterThanOrEqual(rows[i].count);
    }
  });

  it("is deterministic (same yFrac across builds — SSR-stable)", () => {
    const again = buildFieldRows();
    expect(again[0].dots[0]?.yFrac).toBe(rows[0].dots[0]?.yFrac);
  });

  it("only plots beers that carry an ABV", () => {
    const plotted = rows.reduce((n, r) => n + r.dots.length, 0);
    const withAbv = ALL_BEERS.filter((b) => b.abv != null).length;
    expect(plotted).toBe(withAbv);
  });
});

// The insights are the page's factual claims. Assert every number against the
// live data so a refresh can't leave a stale sentence on the page.
describe("FLAVOR_INSIGHTS stay true to the data", () => {
  const total = ALL_BEERS.length;
  const ipa = ALL_BEERS.filter((b) => b.family === "ipa").length;
  const strong = ALL_BEERS.filter((b) => b.abv != null && (b.abv as number) >= 8);
  const sours = ALL_BEERS.filter((b) => b.family === "sour-wild");

  it("has exactly the three insights the copy names", () => {
    expect(FLAVOR_INSIGHTS.map((i) => i.id)).toEqual(["ipa", "strong", "sour"]);
  });

  it("IPA insight: 56 of 174", () => {
    expect(total).toBe(174);
    expect(ipa).toBe(56);
    expect(FLAVOR_INSIGHTS[0].text).toContain("56 of 174");
  });

  it("strong insight: Steinhardt + Midnight Run pour 16 of 40 at 8%+", () => {
    expect(strong).toHaveLength(40);
    const owned = strong.filter(
      (b) =>
        b.brewerySlug === "steinhardt-brewing-company-frederick" ||
        b.brewerySlug === "midnight-run-brewing",
    ).length;
    expect(owned).toBe(16);
    expect(FLAVOR_INSIGHTS[1].text).toContain("16 of the 40");
  });

  it("sour insight: 10 sours averaging 3.87, top beer is the 4.34 sour", () => {
    expect(sours).toHaveLength(10);
    const rated = sours.filter((b) => b.rating != null) as { rating: number }[];
    const avg = rated.reduce((s, b) => s + b.rating, 0) / rated.length;
    expect(avg.toFixed(2)).toBe("3.87");
    const top = [...ALL_BEERS]
      .filter((b) => b.rating != null)
      .sort((a, b) => (b.rating as number) - (a.rating as number))[0];
    expect(top.family).toBe("sour-wild");
    expect((top.rating as number).toFixed(2)).toBe("4.34");
    expect(FLAVOR_INSIGHTS[2].text).toContain("3.87");
    expect(FLAVOR_INSIGHTS[2].text).toContain("4.34");
  });
});
