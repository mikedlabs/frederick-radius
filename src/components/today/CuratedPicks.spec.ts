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

  // Return-visit loop: consecutive days lead with different plans, without
  // breaking the weather override.
  it("rotates the lead day over day", () => {
    const today = orderPicks(null, 100).map((p) => p.slug);
    const tomorrow = orderPicks(null, 101).map((p) => p.slug);
    expect(today[0]).not.toBe(tomorrow[0]);
    // Same set, different order — rotation never adds or drops a plan.
    expect([...today].sort()).toEqual([...tomorrow].sort());
  });
  it("rain still claims the front slot on every rotation", () => {
    for (const day of [100, 101, 102, 103]) {
      expect(orderPicks(true, day)[0].slug).toBe("rainy-day-frederick");
    }
  });
});
