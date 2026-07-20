import { describe, it, expect } from "vitest";
import {
  EMPTY_BEER_FILTER,
  isEmptyBeerFilter,
  filterBeers,
  sortBeers,
  queryBeers,
  familyFacetCounts,
  type BeerFilter,
} from "./beer-index";
import { ALL_BEERS, type BeerWithBrewery } from "@/data/beers";

const beer = (over: Partial<BeerWithBrewery>): BeerWithBrewery => ({
  name: "Test Ale",
  style: "IPA",
  family: "ipa",
  abv: 6.5,
  notes: "citrus and pine",
  flagship: false,
  rating: 3.9,
  untappd: null,
  brewerySlug: "test-brewing",
  breweryName: "Test Brewing",
  town: "frederick",
  ...over,
});

const SAMPLE: BeerWithBrewery[] = [
  beer({ name: "Hop Bomb", family: "ipa", abv: 7.2, rating: 4.1, town: "frederick", brewerySlug: "a", breweryName: "A" }),
  beer({ name: "Night Roast", family: "stout-porter", abv: 5.5, rating: 4.3, notes: "coffee and chocolate", town: "thurmont", brewerySlug: "b", breweryName: "B" }),
  beer({ name: "Sunny Lager", family: "lager-pilsner", abv: 4.4, rating: 3.6, notes: "crisp and clean", town: "frederick", brewerySlug: "a", breweryName: "A", flagship: true }),
  beer({ name: "Mystery Pour", family: "sour-wild", abv: 5.0, rating: null, notes: "tart cherry", town: "mount-airy", brewerySlug: "c", breweryName: "C" }),
];

const f = (over: Partial<BeerFilter>): BeerFilter => ({ ...EMPTY_BEER_FILTER, ...over });

describe("beer-index filter", () => {
  it("empty filter returns everything", () => {
    expect(isEmptyBeerFilter(EMPTY_BEER_FILTER)).toBe(true);
    expect(filterBeers(SAMPLE, EMPTY_BEER_FILTER)).toHaveLength(4);
  });

  it("filters by style family (OR within the set)", () => {
    expect(filterBeers(SAMPLE, f({ families: ["stout-porter"] })).map((b) => b.name)).toEqual(["Night Roast"]);
    expect(filterBeers(SAMPLE, f({ families: ["ipa", "lager-pilsner"] }))).toHaveLength(2);
  });

  it("bounds ABV inclusively and drops unknown ABV when a bound is set", () => {
    expect(filterBeers(SAMPLE, f({ minAbv: 5.5 })).map((b) => b.name).sort()).toEqual(["Hop Bomb", "Night Roast"]);
    expect(filterBeers(SAMPLE, f({ maxAbv: 4.4 })).map((b) => b.name)).toEqual(["Sunny Lager"]);
  });

  it("min rating drops unrated beers (a floor can't vouch for a blank)", () => {
    const out = filterBeers(SAMPLE, f({ minRating: 4.0 })).map((b) => b.name).sort();
    expect(out).toEqual(["Hop Bomb", "Night Roast"]);
    expect(out).not.toContain("Mystery Pour");
  });

  it("filters by town and brewery", () => {
    expect(filterBeers(SAMPLE, f({ town: "frederick" }))).toHaveLength(2);
    expect(filterBeers(SAMPLE, f({ brewerySlug: "b" })).map((b) => b.name)).toEqual(["Night Roast"]);
  });

  it("searches name / brewery / style / notes", () => {
    expect(filterBeers(SAMPLE, f({ q: "coffee" })).map((b) => b.name)).toEqual(["Night Roast"]);
    expect(filterBeers(SAMPLE, f({ q: "cherry" })).map((b) => b.name)).toEqual(["Mystery Pour"]);
  });

  it("flagshipOnly keeps only flagships", () => {
    expect(filterBeers(SAMPLE, f({ flagshipOnly: true })).map((b) => b.name)).toEqual(["Sunny Lager"]);
  });
});

describe("beer-index sort", () => {
  it("rating desc sinks unrated to the bottom", () => {
    const out = sortBeers(SAMPLE, "rating").map((b) => b.name);
    expect(out[0]).toBe("Night Roast"); // 4.3
    expect(out[out.length - 1]).toBe("Mystery Pour"); // unrated
  });
  it("abv asc / desc", () => {
    expect(sortBeers(SAMPLE, "abv-desc")[0].name).toBe("Hop Bomb"); // 7.2
    expect(sortBeers(SAMPLE, "abv-asc")[0].name).toBe("Sunny Lager"); // 4.4
  });
  it("name is alphabetical and deterministic", () => {
    expect(sortBeers(SAMPLE, "name").map((b) => b.name)).toEqual(["Hop Bomb", "Mystery Pour", "Night Roast", "Sunny Lager"]);
  });
});

describe("beer-index facets", () => {
  it("family counts reflect the OTHER active filters", () => {
    // With a Frederick town filter, only Frederick beers count toward families.
    const counts = familyFacetCounts(f({ town: "frederick" }), SAMPLE);
    expect(counts.ipa).toBe(1);
    expect(counts["lager-pilsner"]).toBe(1);
    expect(counts["stout-porter"]).toBeUndefined(); // Night Roast is in Thurmont
  });
  it("family selection does not zero out sibling family counts", () => {
    // Selecting ipa must not make the stout facet read 0 — the base excludes family.
    const counts = familyFacetCounts(f({ families: ["ipa"] }), SAMPLE);
    expect(counts["stout-porter"]).toBe(1);
    expect(counts.ipa).toBe(1);
  });
});

describe("beer-index against the real dataset", () => {
  it("the whole index is queryable and rating-sorted top is a real high scorer", () => {
    const all = queryBeers(EMPTY_BEER_FILTER, "rating");
    expect(all.length).toBe(ALL_BEERS.length);
    expect(all[0].rating).not.toBeNull();
    // a concrete beer-lover query resolves to real rows
    const strongStouts = queryBeers(f({ families: ["stout-porter"], maxAbv: 7 }), "rating");
    expect(strongStouts.length).toBeGreaterThan(0);
    expect(strongStouts.every((b) => b.family === "stout-porter" && (b.abv ?? 0) <= 7)).toBe(true);
  });
});
