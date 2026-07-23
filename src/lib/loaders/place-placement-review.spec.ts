import { describe, expect, it } from "vitest";
import {
  getNeedsReviewPlaces,
  publicPlaces,
} from "@/lib/loaders/places";

describe("place placement review queue", () => {
  it("preserves every pre-gate rejection with actionable context", () => {
    const rows = getNeedsReviewPlaces();

    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every(
        (row) =>
          Boolean(row.slug) &&
          Boolean(row.source) &&
          Boolean(row.address) &&
          Boolean(row.rejection_reason),
      ),
    ).toBe(true);
  });

  it("keeps rejected rows out of the public catalog", () => {
    const publicSlugs = new Set(publicPlaces().map((place) => place.slug));
    const leaked = getNeedsReviewPlaces()
      .filter((place) => publicSlugs.has(place.slug))
      .map((place) => place.slug);

    expect(leaked).toEqual([]);
  });
});
