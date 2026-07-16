import { describe, expect, it } from "vitest";
import { fuseRankedIds } from "./hybrid-search";

describe("hybrid Radius retrieval", () => {
  it("rewards a place supported by both exact and semantic retrieval", () => {
    expect(fuseRankedIds(["exact-only", "both"], ["both", "semantic-only"], 3)[0]).toBe("both");
  });

  it("keeps exact retrieval slightly stronger when lists disagree", () => {
    expect(fuseRankedIds(["exact"], ["semantic"], 2)).toEqual(["exact", "semantic"]);
  });

  it("deduplicates the fused result", () => {
    expect(fuseRankedIds(["a", "a", "b"], ["a", "c"], 10)).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(new Set(fuseRankedIds(["a", "a"], ["a"], 10)).size).toBe(1);
  });
});
