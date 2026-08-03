import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("global search responsive chrome", () => {
  it("keeps desktop keyboard hints out of phone-width layouts", () => {
    const source = readFileSync(
      "src/components/search/SearchOverlay.tsx",
      "utf8",
    );

    expect(source).toContain(
      "[@media(min-width:768px)_and_(hover:hover)_and_(pointer:fine)]:flex",
    );
  });

  it("labels the bounded result window without claiming it is a total", () => {
    const source = readFileSync(
      "src/components/search/SearchOverlay.tsx",
      "utf8",
    );

    expect(source).toContain("`${results.length} shown`");
    expect(source).not.toContain(
      "`${results.length} match${results.length === 1 ? \"\" : \"es\"}`",
    );
  });
});
