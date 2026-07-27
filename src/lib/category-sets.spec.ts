import { describe, expect, it } from "vitest";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import PLACES from "@/data/places-client.json";
import { PHOTOGENIC_CATEGORIES } from "@/lib/photogenic";
import { groupForCategory } from "@/lib/rhythm";

/**
 * Category-name sets rot silently.
 *
 * Across the ranking and curation code there are hand-written sets of category
 * slugs ("is this a morning place?", "would anyone photograph this?"). Nothing
 * checked the strings against the taxonomy, so several entries matched no place
 * at all and had been dead for who knows how long: "cafe" and "breakfast" are
 * not categories (the real ones are "coffee" and "bakery"), "gym" maps to
 * "yoga" in categoryFromGoogle, and "outdoors"/"public-art" are real taxonomy
 * slugs that are PARENTS or empty leaves, so no place is ever filed under them.
 *
 * A dead entry is invisible in production: the set just quietly covers less
 * than it appears to. These tests make that state fail instead.
 */

const REAL_PLACE_CATEGORIES = new Set(
  (PLACES as ReadonlyArray<{ category?: string }>)
    .map((place) => place.category)
    .filter((category): category is string => Boolean(category)),
);

/** Every slug at least one operational place actually carries. */
function expectLivePlaceCategories(name: string, slugs: Iterable<string>): void {
  const dead = [...slugs].filter((slug) => !REAL_PLACE_CATEGORIES.has(slug));
  expect(
    dead,
    `${name} lists ${dead.join(", ")}, which no place carries as its category. ` +
      "Either the slug is wrong, or it is a parent/empty slug that will never match.",
  ).toEqual([]);
}

describe("category sets are checked against the real catalog", () => {
  it("the client dataset still has categories to check against", () => {
    // Guards the guard: if places-client.json ever ships empty, every
    // assertion below would pass vacuously.
    expect(REAL_PLACE_CATEGORIES.size).toBeGreaterThan(20);
  });

  it("photogenic categories all exist on real places", () => {
    expectLivePlaceCategories("PHOTOGENIC_CATEGORIES", PHOTOGENIC_CATEGORIES);
  });

  it("photogenic categories are all known taxonomy slugs", () => {
    const unknown = [...PHOTOGENIC_CATEGORIES].filter((slug) => !CATEGORY_BY_SLUG[slug]);
    expect(unknown).toEqual([]);
  });

  it("the rhythm board groups every category a place can have", () => {
    // groupForCategory falls back to "services" for anything unmapped, which
    // is a legitimate catch-all but hides genuine mistakes. Wellness leaves
    // were landing there because the map keyed on "gym", which is not a
    // category. Assert the wellness family specifically.
    for (const slug of ["wellness", "yoga", "massage", "salon", "spa"]) {
      expect(groupForCategory(slug), `${slug} should group under wellness`).toBe("wellness");
    }
    expect(groupForCategory("park")).toBe("outdoors");
    expect(groupForCategory("brewery")).toBe("pours");
  });

  it("does not treat a parent slug as something a place can be", () => {
    // The two that actually bit us. "outdoors" is the parent of park/trail/
    // playground/golf/agritourism and is a real page; it is simply never a
    // place's own category.
    for (const parent of ["outdoors", "food", "arts"]) {
      expect(CATEGORY_BY_SLUG[parent], `${parent} should still be a real category page`).toBeTruthy();
      expect(REAL_PLACE_CATEGORIES.has(parent)).toBe(false);
    }
  });
});
