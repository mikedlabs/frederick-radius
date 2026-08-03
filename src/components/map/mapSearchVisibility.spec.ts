import { describe, expect, it } from "vitest";
import { mapSearchResultLimit } from "./mapSearchVisibility";

describe("map search result visibility", () => {
  it("keeps keyboard and visual options aligned on phones", () => {
    expect(mapSearchResultLimit(320)).toBe(3);
    expect(mapSearchResultLimit(390)).toBe(3);
    expect(mapSearchResultLimit(520)).toBe(3);
  });

  it("retains four immediate options when the viewport has room", () => {
    expect(mapSearchResultLimit(521)).toBe(4);
    expect(mapSearchResultLimit(1024)).toBe(4);
  });
});
