import { describe, expect, it } from "vitest";

import { fairMapSearchScore, fairMapSearchTerms } from "./map-search";

describe("Fair map smart search", () => {
  it("finds a reviewed restroom from a natural-language request", () => {
    expect(fairMapSearchTerms("Where are the bathrooms?")).toEqual([
      "restroom",
    ]);
    expect(
      fairMapSearchScore("Where are the bathrooms?", [
        "Restroom",
        "bathroom toilet diaper changing",
      ]),
    ).toBeGreaterThan(0);
  });

  it("matches separate reviewed keywords without requiring their order", () => {
    expect(
      fairMapSearchScore("wheelchair rental", [
        "Youth Indoor Exhibits",
        "mobility rental scooter wheelchair stroller",
      ]),
    ).toBeGreaterThan(0);
  });

  it("keeps reviewed transit stops discoverable from their common plural", () => {
    expect(fairMapSearchTerms("Where are the buses?")).toEqual(["bus"]);
    expect(
      fairMapSearchScore("Where are the buses?", [
        "Monocacy Boulevard at Bucheimer Road",
        "county transit bus stop",
      ]),
    ).toBeGreaterThan(0);
  });

  it("does not turn a partial animal-area word into a vendor result", () => {
    expect(
      fairMapSearchScore("White Rabbit", ["Poultry and Rabbits"]),
    ).toBe(0);
  });

  it("keeps exact official labels searchable", () => {
    expect(
      fairMapSearchScore("4-H Building", ["Youth Indoor Exhibits 4-H Building"]),
    ).toBeGreaterThan(1_000);
  });
});
