import { describe, it, expect } from "vitest";
import { groupByTypePreservingOrder } from "@/components/search/SearchOverlay";
import type { SearchResult } from "@/lib/search/index";

/**
 * SearchOverlay's grouping helper — tests that grouping preserves
 * both relevance ordering (top hit's type leads) AND the flat index
 * positions so keyboard nav (activeIdx) still walks the full list.
 */

function r(
  id: string,
  type: SearchResult["type"],
  title: string,
): SearchResult {
  return {
    id,
    type,
    title,
    subtitle: "",
    href: `/${type}/${id}`,
  };
}

describe("groupByTypePreservingOrder", () => {
  it("returns [] for empty input", () => {
    expect(groupByTypePreservingOrder([])).toEqual([]);
  });

  it("groups by type and orders groups by first-occurrence in results", () => {
    const results: SearchResult[] = [
      r("e1", "event", "Alive @ Five"),
      r("p1", "place", "Carroll Creek"),
      r("e2", "event", "First Friday"),
      r("p2", "place", "Baker Park"),
      r("m1", "municipality", "Brunswick"),
    ];
    const grouped = groupByTypePreservingOrder(results);
    // First hit is an event → Events leads, then Places, then Towns.
    expect(grouped.map((g) => g.type)).toEqual(["event", "place", "municipality"]);
    expect(grouped[0].items.map((i) => i.r.id)).toEqual(["e1", "e2"]);
    expect(grouped[1].items.map((i) => i.r.id)).toEqual(["p1", "p2"]);
  });

  it("preserves flat result indices across groups (keyboard-nav contract)", () => {
    const results: SearchResult[] = [
      r("a", "event", "A"),     // idx 0
      r("b", "place", "B"),     // idx 1
      r("c", "event", "C"),     // idx 2
      r("d", "place", "D"),     // idx 3
    ];
    const grouped = groupByTypePreservingOrder(results);
    // Walking the groups in render order MUST surface every original
    // index exactly once. Activity from arrow keys / ↵ uses these
    // indices to look up the active result in the FLAT array.
    const seenIndices: number[] = [];
    for (const g of grouped) for (const it of g.items) seenIndices.push(it.idx);
    expect(seenIndices.sort()).toEqual([0, 1, 2, 3]);
    // Each item carries its original SearchResult reference.
    for (const g of grouped) {
      for (const it of g.items) {
        expect(it.r).toBe(results[it.idx]);
      }
    }
  });

  it("single-type result list collapses to one group", () => {
    const results: SearchResult[] = [
      r("p1", "place", "A"),
      r("p2", "place", "B"),
      r("p3", "place", "C"),
    ];
    const grouped = groupByTypePreservingOrder(results);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].type).toBe("place");
    expect(grouped[0].items).toHaveLength(3);
  });

  it("relevance leads — if Event tops the results, Events group is first", () => {
    const eventLed = groupByTypePreservingOrder([
      r("e", "event", "tonight"),
      r("p", "place", "venue"),
    ]);
    expect(eventLed[0].type).toBe("event");

    const placeLed = groupByTypePreservingOrder([
      r("p", "place", "Carroll Creek"),
      r("e", "event", "summer kickoff"),
    ]);
    expect(placeLed[0].type).toBe("place");
  });
});
