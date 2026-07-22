import { describe, expect, it } from "vitest";
import { groupDealsByVenue } from "./DealsBrowser";
import type { DealRow } from "@/lib/loaders/todaysDeals";

function deal(overrides: Partial<DealRow> = {}): DealRow {
  return {
    slug: "one-place",
    name: "One Place",
    town: "Frederick",
    offer: "$5 drafts",
    hours: "4 PM–7 PM",
    days: [2],
    verified: "Verified July 2026",
    confidence: "high",
    ...overrides,
  };
}

describe("groupDealsByVenue", () => {
  it("keeps every offer and its hours under one venue", () => {
    const groups = groupDealsByVenue([
      deal(),
      deal({ offer: "Half-price wings", hours: "5 PM–9 PM" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].venue.name).toBe("One Place");
    expect(groups[0].offers.map((offer) => [offer.offer, offer.hours])).toEqual([
      ["$5 drafts", "4 PM–7 PM"],
      ["Half-price wings", "5 PM–9 PM"],
    ]);
  });

  it("keeps different venues as separate cards", () => {
    const groups = groupDealsByVenue([
      deal(),
      deal({ slug: "another-place", name: "Another Place" }),
    ]);

    expect(groups.map((group) => group.venue.slug)).toEqual(["another-place", "one-place"]);
  });
});
