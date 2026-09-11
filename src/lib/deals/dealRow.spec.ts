import { describe, expect, it } from "vitest";
import {
  dealHoursForDay,
  dealOfferForDay,
  type DealRow,
} from "./dealRow";

function deal(overrides: Partial<DealRow> = {}): DealRow {
  return {
    slug: "one-place",
    name: "One Place",
    offer: "$5 drafts",
    headline: "$5 drafts",
    fullOffer: "Tuesday: $5 drafts, 4 PM-7 PM",
    hours: "4 PM-7 PM",
    days: [2],
    verified: "Verified July 2026",
    confidence: "high",
    ...overrides,
  };
}

describe("client-safe selected-day deal details", () => {
  it("uses the selected day's offer and timing", () => {
    const row = deal({
      offerByDay: { 2: "$4 pints", 3: "$1 oysters" },
      hoursByDay: { 2: "4 PM-7 PM", 3: "All day" },
    });

    expect(dealOfferForDay(row, 3)).toBe("$1 oysters");
    expect(dealHoursForDay(row, 3)).toBe("All day");
  });

  it("falls back to the shared offer and timing", () => {
    const row = deal();

    expect(dealOfferForDay(row, 5)).toBe("$5 drafts");
    expect(dealHoursForDay(row, 5)).toBe("4 PM-7 PM");
  });
});
