import { describe, expect, it } from "vitest";
import {
  getPlaceBySlug,
  likelyOpenPlaces,
  placesWithinRadius,
  publicPlaceBySlug,
  publicPlaces,
  rankPlaces,
} from "@/lib/loaders/places";

const places = publicPlaces();
const bySlug = new Map(places.map((place) => [place.slug, place]));

describe("curated place inventory regressions", () => {
  const officialHardwareStores = [
    "home-depot-west-frederick",
    "home-depot-frederick",
    "lowes-frederick-buckeystown-pike",
    "lowes-north-frederick",
    "tractor-supply-frederick",
    "tractor-supply-jefferson",
  ] as const;

  it("publishes recently checked official hardware-store hours without bypassing freshness", () => {
    const insideWindow = new Date("2026-08-22T20:00:00.000Z");
    const outsideWindow = new Date("2026-08-30T00:00:01.000Z");

    for (const slug of officialHardwareStores) {
      const source = bySlug.get(slug);
      expect(source, slug).toMatchObject({
        category: "services",
        subcategories: expect.arrayContaining(["hardware"]),
        source: "manual",
        hours_verified: true,
        hours_updated_at: "2026-08-22T00:00:00.000Z",
      });
      expect(source?.source_url, slug).toMatch(/^https:\/\//);

      const fresh = getPlaceBySlug(slug, undefined, insideWindow);
      expect(fresh?.hours, slug).toBeDefined();
      expect(fresh?.hours_verified, slug).toBe(true);

      const stale = getPlaceBySlug(slug, undefined, outsideWindow);
      expect(stale?.hours, slug).toBeUndefined();
      expect(stale?.hours_verified, slug).toBe(false);
      expect(stale?.open_status.state, slug).toBe("unknown");
    }
  });

  it("includes both current Frederick Giant Eagle grocery stores", () => {
    expect(bySlug.get("giant-eagle-west-patrick-frederick")).toMatchObject({
      name: "Giant Eagle - West Patrick Street",
      address: "1275 W Patrick St",
      category: "market",
    });
    expect(bySlug.get("giant-eagle-west-seventh-frederick")).toMatchObject({
      name: "Giant Eagle - West Seventh Street",
      address: "1305 W 7th St",
      category: "market",
    });
  });

  it("uses the current Tin Corner identity instead of the retired Lucky Corner name", () => {
    expect(bySlug.get("tin-corner")).toMatchObject({
      name: "Tin Corner",
      address: "700 N Market St",
      category: "restaurant",
    });
    expect(bySlug.has("lucky-corner-vietnamese-cuisine")).toBe(false);
  });

  it("keeps JKW at its current East Street location", () => {
    expect(bySlug.get("jkw-beauty")).toMatchObject({
      address: "8 N East St",
      category: "wellness",
    });
  });

  it("does not resurrect closed or incorrectly matched storefronts", () => {
    for (const slug of [
      "bad-hair-day",
      "hill-house-bed-and-breakfast",
      "serenity-tearoom-fine-dining",
      "the-alley-wagon",
    ]) {
      expect(bySlug.has(slug), slug).toBe(false);
    }
  });

  it("keeps every discovery path inside the canonical public inventory", () => {
    const publicSlugs = new Set(places.map((place) => place.slug));
    const assertSubset = (slugs: string[]) => {
      expect(slugs.filter((slug) => !publicSlugs.has(slug))).toEqual([]);
    };

    assertSubset(rankPlaces().map((place) => place.slug));
    assertSubset(likelyOpenPlaces(undefined, new Date("2026-07-15T16:00:00Z")).map((place) => place.slug));
    assertSubset(placesWithinRadius({ lng: -77.41, lat: 39.46 }, 100_000).map((place) => place.slug));
    assertSubset(getPlaceBySlug("cafe-nola")?.nearby_places.map((place) => place.slug) ?? []);

    expect(publicPlaceBySlug("sailing-through-the-winter-solstice")).toBeUndefined();
    expect(publicPlaceBySlug("a")).toBeUndefined();
  });
});
