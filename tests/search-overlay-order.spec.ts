import { describe, expect, it } from "vitest";
import { splitBestMatch } from "@/components/search/SearchOverlay";
import type { SearchResult } from "@/lib/search/index";

function result(id: string, type: SearchResult["type"]): SearchResult {
  return {
    id,
    type,
    title: id,
    subtitle: "",
    href: `/${type}/${id}`,
  };
}

describe("SearchOverlay ranked presentation", () => {
  it("keeps the API order after giving the first result the decision card", () => {
    const ranked = [
      result("place-0", "place"),
      result("event-1", "event"),
      result("place-2", "place"),
      result("tool-3", "action"),
    ];

    const { best, rest } = splitBestMatch(ranked);

    expect(best).toBe(ranked[0]);
    expect(rest.map(({ r }) => r)).toEqual(ranked.slice(1));
    expect(rest.map(({ idx }) => idx)).toEqual([1, 2, 3]);
  });

  it("handles an empty result set", () => {
    expect(splitBestMatch([])).toEqual({ best: null, rest: [] });
  });
});
