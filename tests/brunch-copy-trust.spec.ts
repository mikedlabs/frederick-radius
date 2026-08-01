import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  brunchSpots,
  brunchVerificationDate,
} from "@/lib/loaders/brunch";

describe("brunch guide trust copy", () => {
  it("does not infer row-level verification dates from source links", () => {
    const spots = brunchSpots();
    expect(spots.length).toBeGreaterThan(0);
    expect(spots.every((spot) => Boolean(spot.sourceUrl))).toBe(true);
    expect(spots.map(brunchVerificationDate).every((date) => date === null)).toBe(
      true,
    );
  });

  it("uses source-linked list language instead of exhaustive checked claims", () => {
    const source = readFileSync(
      "src/app/(app)/brunch/page.tsx",
      "utf8",
    );

    expect(source).toContain("A source-linked list of brunch spots");
    expect(source).toContain("Source linked");
    expect(source).not.toContain("Every spot in the county");
    expect(source).not.toContain("CHECKED AT SOURCE");
    expect(source).not.toContain("Checked at source");
  });
});
