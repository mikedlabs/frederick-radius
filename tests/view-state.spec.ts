import { describe, it, expect } from "vitest";
import { parseViewState, toQuery, isEmptyViewState, type ViewState } from "@/lib/view-state";

const rt = (s: ViewState) => parseViewState(new URLSearchParams(toQuery(s)));

describe("view-state codec", () => {
  it("empty ViewState <-> empty query (zero lenses === today)", () => {
    expect(toQuery({})).toBe("");
    expect(parseViewState(new URLSearchParams(""))).toEqual({});
    expect(isEmptyViewState({})).toBe(true);
  });

  it("round-trips a fully-populated ViewState", () => {
    const s: ViewState = {
      cats: ["food", "park"],
      amenityGroups: ["restroom", "water"],
      onlyGems: true,
      municipality: "brunswick",
      when: "weekend",
      radiusM: 1600,
      showCivic: true,
      showUnverified: true,
    };
    expect(rt(s)).toEqual(s);
  });

  it("omits falsey/empty/default fields entirely", () => {
    const q = toQuery({ cats: [], onlyGems: false, municipality: "", radiusM: 0 });
    expect(q).toBe("");
  });

  it("produces a stable, sorted query regardless of insertion order", () => {
    const a = toQuery({ when: "today", cats: ["a"], onlyGems: true });
    const b = toQuery({ onlyGems: true, cats: ["a"], when: "today" });
    expect(a).toBe(b);
    expect(a).toBe("cats=a&gems=1&when=today");
  });

  it("ignores garbage instead of throwing", () => {
    const sp = new URLSearchParams("when=banana&r=-5&cats=Foo!,bar&gems=yes&m=Has%20Space");
    const s = parseViewState(sp);
    expect(s.when).toBeUndefined();
    expect(s.radiusM).toBeUndefined();
    expect(s.cats).toEqual(["bar"]); // "Foo!" rejected by slug rule
    expect(s.onlyGems).toBeUndefined(); // only "1" is true
    expect(s.municipality).toBeUndefined(); // space fails slug rule
  });

  it("de-dupes and lowercases category tokens, preserving order", () => {
    const s = parseViewState(new URLSearchParams("cats=Park,park,FOOD"));
    expect(s.cats).toEqual(["park", "food"]);
  });

  it("rounds a fractional radius", () => {
    expect(rt({ radiusM: 1609.34 }).radiusM).toBe(1609);
  });
});
