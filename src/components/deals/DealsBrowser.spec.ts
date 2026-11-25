import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DealsBrowser, {
  dealMatchesQuery,
  easternDayIndex,
  groupDealsByVenue,
  selectionAfterDayRollover,
  shouldShowAvailableNow,
  synchronizeDealDay,
} from "./DealsBrowser";
import type { DealRow } from "@/lib/deals/dealRow";

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
    verified: "verified 2w ago",
    verifiedCurrent: true,
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

  it("lists a venue with a current source check ahead of stale ones", () => {
    const stale = { verified: "last checked Jun 2026", verifiedCurrent: false };
    const groups = groupDealsByVenue([
      deal({ slug: "alpha", name: "Alpha Tavern", ...stale }),
      deal({ slug: "zebra", name: "Zebra Grill" }),
      deal({ slug: "beta", name: "Beta Pub", ...stale }),
      // One current offer is enough to lift a venue that also has a stale one.
      deal({ slug: "mixed", name: "Mixed House", ...stale }),
      deal({ slug: "mixed", name: "Mixed House", offer: "Half-price wings" }),
    ]);

    expect(groups.map((group) => group.venue.slug)).toEqual([
      "mixed",
      "zebra",
      "alpha",
      "beta",
    ]);
    expect(groups[0].offers).toHaveLength(2);
  });
});

describe("source-check label", () => {
  // Tuesday, July 28, 2026 in Frederick, matching the fixture's deal day.
  const nowIso = "2026-07-28T16:00:00Z";
  const render = (rows: DealRow[]) =>
    renderToStaticMarkup(
      createElement(DealsBrowser, { rows, today: 2, nowIso }),
    );
  const badges = (html: string) => html.match(/lucide-badge-check/g) ?? [];

  it("gives a current check the verified badge in the positive tone", () => {
    const html = render([deal()]);

    expect(html).toContain("Verified 2w ago");
    expect(badges(html)).toHaveLength(1);
    expect(html).toMatch(
      /color:var\(--app-positive\)[^>]*><svg[^>]*lucide-badge-check/,
    );
  });

  it("prints a stale check as a muted date with no badge", () => {
    const html = render([
      deal({ verified: "last checked Jun 2026", verifiedCurrent: false }),
    ]);

    expect(html).toContain("Last checked Jun 2026");
    expect(html).not.toMatch(/Verified \d/);
    expect(badges(html)).toHaveLength(0);
    expect(html).toMatch(/color:var\(--app-ink-3\)[^>]*>Last checked Jun 2026/);
  });

  it("badges only the current offer when a venue has both", () => {
    const html = render([
      deal(),
      deal({
        offer: "Half-price wings",
        headline: "Half-price wings",
        verified: "last checked Jun 2026",
        verifiedCurrent: false,
      }),
    ]);

    expect(html).toContain("Verified 2w ago");
    expect(html).toContain("Last checked Jun 2026");
    expect(badges(html)).toHaveLength(1);
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
