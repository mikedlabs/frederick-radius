import { describe, expect, it } from "vitest";
import {
  MAX_FOLLOWED_PLACES,
  MAX_FOLLOW_SLUG_LENGTH,
  normalizeFollowSlugs,
} from "./follows-contract";

describe("follow contract", () => {
  it("deduplicates and bounds without changing relevance order", () => {
    const input = [
      " newest ",
      "newest",
      ...Array.from(
        { length: MAX_FOLLOWED_PLACES + 20 },
        (_, index) => `save-${index}`,
      ),
    ];
    const result = normalizeFollowSlugs(input);

    expect(result).toHaveLength(MAX_FOLLOWED_PLACES);
    expect(result.slice(0, 3)).toEqual(["newest", "save-0", "save-1"]);
  });

  it("rejects malformed and oversized slugs", () => {
    expect(
      normalizeFollowSlugs([
        null,
        42,
        "",
        "x".repeat(MAX_FOLLOW_SLUG_LENGTH + 1),
        "valid-place",
      ]),
    ).toEqual(["valid-place"]);
  });
});
