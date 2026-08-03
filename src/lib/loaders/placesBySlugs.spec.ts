import { describe, expect, it } from "vitest";
import {
  MAX_PLACES_BY_SLUG,
  normalizeRequestedPlaceSlugs,
  resolvePlacesBySlugs,
} from "./placesBySlugs";

describe("places by slugs", () => {
  it("normalizes, bounds, and deduplicates a resolved request", () => {
    const slugs = normalizeRequestedPlaceSlugs(
      " gravel-and-grind-frederick,gravel-and-grind-frederick,missing-place ",
    );
    const places = resolvePlacesBySlugs(slugs);

    expect(places.map((place) => place.slug)).toEqual([
      "gravel-and-grind-frederick",
    ]);
  });

  it("caps pathological requests before catalog lookup", () => {
    const slugs = normalizeRequestedPlaceSlugs(
      Array.from({ length: MAX_PLACES_BY_SLUG + 25 }, (_, index) =>
        `place-${index}`,
      ).join(","),
    );

    expect(slugs).toHaveLength(MAX_PLACES_BY_SLUG);
  });
});
