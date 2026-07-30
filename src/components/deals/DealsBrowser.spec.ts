import { describe, expect, it } from "vitest";
import {
  dealMatchesQuery,
  easternDayIndex,
  groupDealsByVenue,
  selectionAfterDayRollover,
  shouldShowAvailableNow,
  synchronizeDealDay,
} from "./DealsBrowser";
import type { DealRow } from "@/lib/loaders/todaysDeals";

function deal(overrides: Partial<DealRow> = {}): DealRow {
  return {
    slug: "one-place",
    name: "One Place",
    town: "Frederick",
    offer: "$5 drafts",
    headline: "$5 drafts",
    fullOffer: "Tuesday: $5 drafts, 4 PM–7 PM",
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

describe("dealMatchesQuery", () => {
  it("searches the selected-day offer instead of unrelated source clauses", () => {
    const row = deal({
      offer: "Tuesday pints; Wednesday oysters",
      headline: "Tuesday pints",
      fullOffer: "Tuesday pints; Wednesday oysters",
      offerByDay: {
        2: "$4 craft draft pints",
        3: "$1 oysters",
      },
      days: [2, 3],
    });

    expect(dealMatchesQuery(row, "pints", 2)).toBe(true);
    expect(dealMatchesQuery(row, "oysters", 2)).toBe(false);
    expect(dealMatchesQuery(row, "oysters", 3)).toBe(true);
  });

  it("also searches venue and town names", () => {
    const row = deal({ name: "Corner Bistro", town: "Walkersville" });

    expect(dealMatchesQuery(row, "corner", 2)).toBe(true);
    expect(dealMatchesQuery(row, "walkersville", 2)).toBe(true);
  });
});

describe("Eastern day rollover", () => {
  it("uses Frederick's day rather than the server's timezone", () => {
    expect(easternDayIndex(new Date("2026-07-29T03:59:00Z"))).toBe(2);
    expect(easternDayIndex(new Date("2026-07-29T04:01:00Z"))).toBe(3);
  });

  it("follows midnight only when the visitor was still viewing today", () => {
    expect(selectionAfterDayRollover(2, 2, 3)).toBe(3);
    expect(selectionAfterDayRollover(5, 2, 3)).toBe(5);
    expect(selectionAfterDayRollover("ongoing", 2, 3)).toBe("ongoing");
  });

  it("replaces an ISR-stale weekday with the browser's current Eastern day", () => {
    expect(
      synchronizeDealDay(2, 2, new Date("2026-07-29T04:01:00Z")),
    ).toEqual({ today: 3, selection: 3 });
  });

  it("keeps an active Available now filter visible when its last window closes", () => {
    expect(shouldShowAvailableNow(2, 2, 1, true)).toBe(true);
    expect(shouldShowAvailableNow(2, 2, 0, true)).toBe(true);
    expect(shouldShowAvailableNow(2, 2, 0, false)).toBe(false);
  });
});
