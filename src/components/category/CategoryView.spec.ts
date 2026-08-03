import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/category/CategoryView.tsx", "utf8");

describe("CategoryView location contract", () => {
  it("does not substitute Downtown Frederick when no town is known", () => {
    expect(source).not.toContain("FREDERICK_CENTER");
    expect(source).toContain("const origin = town?.centroid;");
    expect(source).toContain(
      ".filter((g) => !town || g.municipality !== town.slug)",
    );
  });
});
