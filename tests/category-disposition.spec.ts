import { describe, expect, it } from "vitest";

import { hasCategoryDisposition } from "../scripts/lib/category-disposition";

describe("category audit disposition", () => {
  it("accepts an explicit category decision", () => {
    expect(hasCategoryDisposition({ category: "coffee" })).toBe(true);
  });

  it("accepts a full wrong-profile quarantine", () => {
    expect(hasCategoryDisposition({ clearEnrichment: true })).toBe(true);
  });

  it("does not treat a rating-only clearGoogle patch as a category decision", () => {
    expect(hasCategoryDisposition({ clearGoogle: true })).toBe(false);
  });
});
