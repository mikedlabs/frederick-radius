import { describe, expect, it } from "vitest";
import type { BeerWithBrewery } from "@/data/beers";
import { beerMatchesTastePath, buildTasteFlight, tastePathStats } from "./beer-experience";

function beer(
  name: string,
  brewerySlug: string,
  family: BeerWithBrewery["family"],
  over: Partial<BeerWithBrewery> = {},
): BeerWithBrewery {
  return {
    name,
    brewerySlug,
    breweryName: brewerySlug.toUpperCase(),
    town: "frederick",
    style: family,
    family,
    abv: 6,
    notes: "A useful note.",
    flagship: false,
    rating: null,
    untappd: null,
    ...over,
  };
}

describe("buildTasteFlight", () => {
  it("returns a varied three-pour flight from three breweries", () => {
    const beers = [
      beer("IPA One", "a", "ipa", { flagship: true, rating: 4.5 }),
      beer("IPA Two", "a", "ipa", { rating: 4.9 }),
      beer("Hazy One", "b", "wheat-hazy", { style: "Hazy IPA", flagship: true, rating: 4.1 }),
      beer("IPA Three", "c", "ipa", { flagship: true, rating: 4.0 }),
      beer("Stout", "d", "stout-porter", { flagship: true, rating: 5 }),
    ];

    const flight = buildTasteFlight(beers, "hoppy", "any");
    expect(flight.map((item) => item.name)).toEqual(["IPA One", "Hazy One", "IPA Three"]);
    expect(new Set(flight.map((item) => item.brewerySlug)).size).toBe(3);
    expect(new Set(flight.map((item) => item.family))).toEqual(new Set(["ipa", "wheat-hazy"]));
  });

  it("honors easy and bold strength filters without falling back outside them", () => {
    const beers = [
      beer("Easy", "a", "lager-pilsner", { abv: 5.5, flagship: true }),
      beer("Regular", "b", "pale-ale", { abv: 6.2, flagship: true }),
      beer("Bold", "c", "lager-pilsner", { abv: 8, flagship: true }),
      beer("Unknown", "d", "pale-ale", { abv: null, flagship: true }),
    ];

    expect(buildTasteFlight(beers, "crisp", "easy").map((item) => item.name)).toEqual(["Easy"]);
    expect(buildTasteFlight(beers, "crisp", "bold").map((item) => item.name)).toEqual(["Bold"]);
  });

  it("is deterministic and treats rating as a tie-break after flagship status", () => {
    const beers = [
      beer("Rated", "a", "ipa", { rating: 4.9 }),
      beer("Signature", "b", "ipa", { flagship: true, rating: 3.5 }),
      beer("Hazy", "c", "wheat-hazy", { flagship: true, rating: 4 }),
    ];

    const first = buildTasteFlight(beers, "hoppy", "any", 1);
    const second = buildTasteFlight([...beers].reverse(), "hoppy", "any", 1);
    expect(first.map((item) => item.name)).toEqual(["Signature"]);
    expect(second).toEqual(first);
  });

  it("handles empty results and non-positive limits", () => {
    expect(buildTasteFlight([], "dark", "any")).toEqual([]);
    expect(buildTasteFlight([beer("Stout", "a", "stout-porter")], "dark", "any", 0)).toEqual([]);
  });

  it("does not confuse traditional wheat beers with hazy IPAs", () => {
    const hazyIpa = beer("Juicy", "a", "wheat-hazy", { style: "Double Hazy IPA" });
    const hefeweizen = beer("Hefe", "b", "wheat-hazy", { style: "Hefeweizen" });
    const saison = beer("Saison", "c", "belgian-farmhouse", { style: "Saison / Farmhouse Ale" });

    expect(beerMatchesTastePath(hazyIpa, "hoppy")).toBe(true);
    expect(beerMatchesTastePath(hazyIpa, "old-world")).toBe(false);
    expect(beerMatchesTastePath(hefeweizen, "hoppy")).toBe(false);
    expect(beerMatchesTastePath(hefeweizen, "old-world")).toBe(true);
    expect(beerMatchesTastePath(saison, "old-world")).toBe(true);
  });
});

describe("tastePathStats", () => {
  it("counts matching beers and distinct breweries", () => {
    const beers = [
      beer("One", "a", "sour-wild"),
      beer("Two", "a", "specialty-other"),
      beer("Three", "b", "specialty-other"),
      beer("Four", "c", "ipa"),
    ];
    expect(tastePathStats(beers, "tart")).toEqual({ beers: 3, breweries: 2 });
  });
});
