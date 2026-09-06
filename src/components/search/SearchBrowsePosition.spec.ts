import { describe, expect, it } from "vitest";
import { parseSearchPositions } from "./SearchBrowsePosition";

describe("search comparison scroll state", () => {
  const at = 100_000;
  it("keeps different town and result-type comparisons separate", () => {
    const rows = [
      { href: "/search?q=coffee&in=brunswick&kind=place", scrollY: 450, at, expanded: true },
      { href: "/search?q=coffee&in=thurmont", scrollY: 200, at },
    ];
    expect(parseSearchPositions(JSON.stringify(rows), at)).toEqual(rows);
  });
  it("discards stale, invalid, or unbounded position data", () => {
    expect(parseSearchPositions("invalid", at)).toEqual([]);
    expect(parseSearchPositions(JSON.stringify([{ href: "/search?q=coffee", scrollY: -1, at }]), at)).toEqual([]);
    expect(parseSearchPositions(JSON.stringify([{ href: "/search?q=coffee", scrollY: 10, at }]), at + 30 * 60_000 + 1)).toEqual([]);
    expect(parseSearchPositions(JSON.stringify([{ href: "/api/private", scrollY: 10, at }]), at)).toEqual([]);
  });
});
