import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("BeenHereToggle accessibility contract", () => {
  it("keeps each visible action phrase inside its accessible name", () => {
    const source = readFileSync(
      "src/components/place/BeenHereToggle.tsx",
      "utf8",
    );

    expect(source).toContain("`Been here: ${label}. Mark as not visited`");
    expect(source).toContain("`Mark as visited: ${label}`");
  });
});
