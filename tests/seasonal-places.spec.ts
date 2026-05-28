import { describe, it, expect } from "vitest";
import { isInSeason } from "@/lib/loaders/places";

/**
 * Seasonal-place gate — Carroll Creek's "Sailing Through the Winter
 * Solstice" installation runs Nov-early Feb; before this gate, it
 * appeared in /places year-round and read as "currently running" even
 * in July. seasonal-places.json now lists it as months [11, 12, 1, 2].
 *
 * The helper is pure: a clock injected as `now`. Production calls
 * default to new Date(), but tests can advance the clock without
 * touching globals.
 */
describe("isInSeason", () => {
  const sailing = { slug: "sailing-through-the-winter-solstice" };
  const normal = { slug: "carroll-creek-linear-park-frederick" };

  it("places not listed in seasonal-places.json are always in season", () => {
    // Test for every month — should always be true for a non-seasonal slug.
    for (let m = 0; m < 12; m++) {
      const d = new Date(2026, m, 15);
      expect(isInSeason(normal, d)).toBe(true);
    }
  });

  it("sailing IS in season Nov-Feb", () => {
    expect(isInSeason(sailing, new Date(2026, 10, 15))).toBe(true); // November
    expect(isInSeason(sailing, new Date(2026, 11, 15))).toBe(true); // December
    expect(isInSeason(sailing, new Date(2027, 0, 15))).toBe(true);  // January
    expect(isInSeason(sailing, new Date(2027, 1, 15))).toBe(true);  // February
  });

  it("sailing is NOT in season Mar-Oct", () => {
    expect(isInSeason(sailing, new Date(2026, 2, 15))).toBe(false); // March
    expect(isInSeason(sailing, new Date(2026, 5, 15))).toBe(false); // June
    expect(isInSeason(sailing, new Date(2026, 8, 15))).toBe(false); // September
    expect(isInSeason(sailing, new Date(2026, 9, 15))).toBe(false); // October
  });

  it("month boundary — first and last day of each season month behaves correctly", () => {
    expect(isInSeason(sailing, new Date(2026, 10, 1))).toBe(true); // Nov 1
    expect(isInSeason(sailing, new Date(2027, 1, 28))).toBe(true); // Feb 28
    // Day before season starts
    expect(isInSeason(sailing, new Date(2026, 9, 31))).toBe(false); // Oct 31
    // Day after season ends
    expect(isInSeason(sailing, new Date(2027, 2, 1))).toBe(false); // Mar 1
  });
});
