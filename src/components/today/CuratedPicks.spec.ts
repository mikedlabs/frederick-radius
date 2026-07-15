import { describe, expect, it } from "vitest";
import { orderPicks } from "./CuratedPicks";

// The weather-aware collection rule (July 2026 outside review: "funny
// there's a collection on the front page for Rainy Days yet the forecast
// is clear").
describe("orderPicks", () => {
  it("rain ahead leads with the rainy-day plan", () => {
    expect(orderPicks(true)[0].slug).toBe("rainy-day-frederick");
  });

  it("a clear forecast swaps rainy-day out entirely", () => {
    const slugs = orderPicks(false).map((p) => p.slug);
    expect(slugs).not.toContain("rainy-day-frederick");
    expect(slugs).toContain("frederick-without-a-plan");
  });

  it("no forecast keeps the evergreen order rather than guessing", () => {
    const slugs = orderPicks(null).map((p) => p.slug);
    expect(slugs).toContain("rainy-day-frederick");
    expect(slugs[0]).toBe("walkable-date-night");
  });

  it("never changes the pick count", () => {
    expect(orderPicks(true)).toHaveLength(4);
    expect(orderPicks(false)).toHaveLength(4);
    expect(orderPicks(null)).toHaveLength(4);
  });
});
