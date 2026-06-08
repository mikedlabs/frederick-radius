import { describe, it, expect } from "vitest";
import { townStats } from "@/lib/guided/town-stats";
import { MUNICIPALITIES } from "@/data/municipalities";

// Integration-style: runs against the real loaders so the picker can't ship
// claiming counts the data doesn't support.
describe("townStats", () => {
  const stats = townStats(new Date("2026-06-08T12:00:00Z"));

  it("covers every municipality exactly once", () => {
    expect(stats.length).toBe(MUNICIPALITIES.length);
    expect(new Set(stats.map((s) => s.slug)).size).toBe(stats.length);
  });

  it("counts are real, non-negative, and sorted by placeCount desc", () => {
    for (const s of stats) {
      expect(s.placeCount).toBeGreaterThanOrEqual(0);
      expect(s.eventCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(s.bestFor)).toBe(true);
      expect(s.bestFor.length).toBeLessThanOrEqual(2);
    }
    const counts = stats.map((s) => s.placeCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("Frederick — the county seat — leads on recommendable places", () => {
    expect(stats[0].slug).toBe("frederick");
    expect(stats[0].placeCount).toBeGreaterThan(0);
  });
});
