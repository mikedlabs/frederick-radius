import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const intelligenceSource = readFileSync(
  new URL("../src/lib/ask/intelligence.ts", import.meta.url),
  "utf8",
);

describe("Ask hybrid recommendation eligibility", () => {
  it("keeps semantic recall behind the shared recommendation gate", () => {
    expect(intelligenceSource).toContain(
      'import { isRecommendable } from "@/lib/relevance";',
    );
    expect(intelligenceSource).toMatch(
      /function semanticPlaceAllowed[\s\S]*?if \(!isRecommendable\(place\)\) return false;/,
    );
  });
});
