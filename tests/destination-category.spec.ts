import { describe, it, expect } from "vitest";
import { isDestinationCategory, NON_DESTINATION_CATEGORIES } from "@/lib/relevance";

/**
 * PR4 — town "Worth your time" should favor destinations over personal
 * services. The lever is the category (these unenriched DFP rows carry no
 * Google primary_type and feature_score is saturated at 10.0), so the
 * destination/service split must be correct and the ordering must put
 * destinations first.
 */
describe("isDestinationCategory", () => {
  it("treats things you explore as destinations", () => {
    for (const c of ["food", "restaurant", "coffee", "brewery", "bar", "bakery", "arts", "museum", "gallery", "theater", "music", "park", "trail", "outdoors", "family", "shopping", "antiques", "book-store", "market"]) {
      expect(isDestinationCategory(c)).toBe(true);
    }
  });

  it("down-ranks personal services, civic rooms, and pure amenities", () => {
    for (const c of ["wellness", "yoga", "services", "civic", "worship", "government", "pharmacy", "lodging", "restroom", "parking"]) {
      expect(isDestinationCategory(c)).toBe(false);
      expect(NON_DESTINATION_CATEGORIES.has(c)).toBe(true);
    }
  });

  it("is case/space tolerant and treats unknown/empty as a destination (never hide on a guess)", () => {
    expect(isDestinationCategory(" Wellness ")).toBe(false);
    expect(isDestinationCategory("")).toBe(true);
    expect(isDestinationCategory(undefined)).toBe(true);
    expect(isDestinationCategory("some-new-category")).toBe(true);
  });
});

describe("Worth-your-time ordering — destinations lead even with equal/higher service scores", () => {
  // Mirrors the page comparator: destination group first, then feature_score,
  // then stable input order.
  type Row = { category: string; feature_score: number; name: string };
  const order = (rows: Row[]) =>
    rows
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        const da = isDestinationCategory(a.p.category) ? 0 : 1;
        const db = isDestinationCategory(b.p.category) ? 0 : 1;
        return da - db || b.p.feature_score - a.p.feature_score || a.i - b.i;
      })
      .map((x) => x.p.name);

  it("a brewery (9) outranks a higher-scored massage studio (10)", () => {
    const out = order([
      { category: "wellness", feature_score: 10, name: "Unwind Massage" },
      { category: "brewery", feature_score: 9, name: "Smoketown Brewing" },
      { category: "civic", feature_score: 10, name: "Friends Meeting" },
    ]);
    expect(out[0]).toBe("Smoketown Brewing");
    expect(out[out.length - 1]).not.toBe("Smoketown Brewing");
  });
});
