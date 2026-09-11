import { describe, expect, it } from "vitest";
import {
  backgroundPlacesForMapSource,
  curatedPlacesForMapSource,
} from "./mapSourceFilter";

const countyPlaces = [
  { slug: "gravel-and-grind", category: "coffee" },
  { slug: "beans-in-the-belfry", category: "coffee" },
  { slug: "unrelated-steakhouse", category: "restaurants" },
  { slug: "unrelated-auto-shop", category: "services" },
];

describe("curatedPlacesForMapSource", () => {
  it("keeps the full curated map only when no place filter is active", () => {
    const source = curatedPlacesForMapSource(countyPlaces, null);

    expect(source).toBe(countyPlaces);
    expect(source).toHaveLength(4);
  });

  it("limits a Coffee source and its possible cluster counts to Coffee matches", () => {
    const coffeePool = countyPlaces.filter((place) => place.category === "coffee");
    const source = curatedPlacesForMapSource(
      countyPlaces,
      new Set(coffeePool.map((place) => place.slug)),
    );

    // Mapbox's point_count is derived from this source. With only the matched
    // pool present, no Coffee cluster can count more than the Coffee pool.
    expect(source).toHaveLength(coffeePool.length);
    expect(source.length).toBeLessThanOrEqual(coffeePool.length);
    expect(source.map((place) => place.slug)).toEqual([
      "gravel-and-grind",
      "beans-in-the-belfry",
    ]);
    expect(source.some((place) => place.slug === "unrelated-steakhouse")).toBe(false);
    expect(source.some((place) => place.slug === "unrelated-auto-shop")).toBe(false);
  });

  it("renders no curated pin when an active filter has no matches", () => {
    expect(curatedPlacesForMapSource(countyPlaces, new Set())).toEqual([]);
  });

  it("hides unlabeled background place context while a place filter is active", () => {
    const osmContext = [{ osm_id: "node/1" }, { osm_id: "node/2" }];

    expect(backgroundPlacesForMapSource(osmContext, false)).toBe(osmContext);
    expect(backgroundPlacesForMapSource(osmContext, true)).toEqual([]);
  });
});
