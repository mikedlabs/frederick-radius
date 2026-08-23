import { describe, expect, it } from "vitest";

import {
  normalizeQueryKey,
  worthLoggingSearchMiss,
} from "@/lib/telemetry/searchMiss";

describe("search miss quality", () => {
  it("groups punctuation and leading articles into one useful intent", () => {
    expect(normalizeQueryKey("A dog-friendly patio! ")).toBe(
      "dog friendly patio",
    );
  });

  it.each(["f", "bu", "do", "the", " and "])(
    "rejects incomplete or non-intent query %j",
    (query) => {
      expect(worthLoggingSearchMiss(query.trim())).toBe(false);
    },
  );

  it.each(["tea", "DMV", "quiet place to read", "wheelchair accessible patio"])(
    "keeps meaningful compact and natural-language intent %j",
    (query) => {
      expect(worthLoggingSearchMiss(query)).toBe(true);
    },
  );
});
