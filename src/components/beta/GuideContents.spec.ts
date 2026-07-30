import { describe, expect, it } from "vitest";
import { openNowLine } from "@/components/beta/GuideContents";

describe("beta open-now proof copy", () => {
  it("separates the editorial examples from the confirmed inventory", () => {
    expect(
      openNowLine({
        inventoryCount: 42,
        worthConsidering: [
          { name: "A Local Cafe", module: "eat-drink" },
          { name: "A County Park", module: "things-to-do" },
          { name: "A Book Store", module: "shop-local" },
        ],
        asOf: "2026-07-29T14:00:00-04:00",
      }),
    ).toEqual({
      lead: "Worth considering now:",
      rest:
        " A Local Cafe, A County Park, and A Book Store. As of 2pm, recently checked posted hours confirm 42 county listings are open.",
    });
  });

  it("does not claim that the catalog is live to the minute", () => {
    const line = openNowLine({
      inventoryCount: 1,
      worthConsidering: [],
      asOf: "2026-07-29T14:00:00-04:00",
    });

    expect(line?.rest).toBe(
      "As of 2pm, recently checked posted hours confirm one county listing is open.",
    );
    expect(`${line?.lead} ${line?.rest}`).not.toMatch(
      /live to the minute|at this minute/i,
    );
  });
});
