import { describe, expect, it } from "vitest";
import { mapFallbackResults } from "./mapFallbackResults";
import type { SearchResult } from "@/lib/search/index";

const records = [
  { slug: "brunswick-coffee", municipality: "brunswick" },
  { slug: "frederick-coffee", municipality: "frederick" },
  { slug: "brunswick-hardware", municipality: "brunswick" },
];
const matches = [{ id: "place:brunswick-coffee", type: "place" }, { id: "place:frederick-coffee", type: "place" }] as SearchResult[];
describe("map fallback constraints", () => {
  it("keeps both the query and named town when the renderer fails", () => {
    expect(mapFallbackResults(records, matches, "coffee", "brunswick", "place")).toEqual([records[0]]);
  });
  it("does not turn an empty search into all county results", () => {
    expect(mapFallbackResults(records, [], "coffee", null, "place")).toEqual([]);
  });
  it("keeps useful manual town browsing when there is no query", () => {
    expect(mapFallbackResults(records, [], "", "brunswick", "place")).toEqual([records[0], records[2]]);
  });
});
