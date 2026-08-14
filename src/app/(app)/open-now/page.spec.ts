import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Open now scope contract", () => {
  it("does not invent a downtown origin for whole-county browsing", () => {
    expect(source).not.toContain("FREDERICK_CENTER");
    expect(source).toContain("const origin = homeCentroid ?? undefined");
  });

  it("passes the selected-town boundary and origin trust to both inventories", () => {
    expect(source).toContain(
      "municipality: rankingContext.filterMunicipality ?? undefined",
    );
    expect(source).toContain("originSource: rankingContext.source");
    expect(source).toContain(
      "getOpenNowSnapshot(now, origin, 0, openNowRanking)",
    );
    expect(source).toContain(
      "likelyOpenPlaces(origin, now, openNowRanking)",
    );
  });
});
