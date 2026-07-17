import { describe, expect, it } from "vitest";
import { CRAVING_BY_KEY, matchesCraving } from "@/data/cravings";
import { publicPlaces } from "@/lib/loaders/places";

describe("municipality intent coverage", () => {
  it("does not claim Urbana has no coffee", () => {
    const coffee = CRAVING_BY_KEY.coffee;
    const urbanaCoffee = publicPlaces()
      .filter((place) => place.municipality === "urbana")
      .filter((place) => matchesCraving(coffee, place));

    expect(urbanaCoffee.map((place) => place.name)).toEqual(
      expect.arrayContaining([
        "Starbucks Coffee Company",
        "Dunkin'",
        "Pumpernickel + Rye",
        "Panera Bread",
      ]),
    );
  });

  it("keeps multi-role places available to their primary intent", () => {
    const food = CRAVING_BY_KEY.food;
    const panera = publicPlaces().find((place) => place.slug === "panera-bread-urbana");

    expect(panera).toBeDefined();
    expect(matchesCraving(food, panera!)).toBe(true);
  });

  it("keeps restaurant bars and brewpubs visible under drinks", () => {
    const drinks = CRAVING_BY_KEY.drinks;
    const expected = [
      "bollingers-restaurant-and-uncle-dirtys-brew-works-thurmont",
      "10tavern-thurmont",
      "habanero-mexican-food-bar-grill-new-market",
      "vesuvius-italian-wine-bar-urbana",
    ];

    for (const slug of expected) {
      const place = publicPlaces().find((candidate) => candidate.slug === slug);
      expect(place, `${slug} should be published`).toBeDefined();
      expect(matchesCraving(drinks, place!), `${slug} should answer Drinks`).toBe(true);
    }
  });

  it("keeps small-town food markets visible under grocery", () => {
    const grocery = CRAVING_BY_KEY.grocery;
    const expected = [
      "jubilee-foods-emmitsburg",
      "trouts-market-woodsboro",
      "superfoods-cafe-market-mount-airy",
      "myersville-market-crown-gas-station-myersville",
    ];

    for (const slug of expected) {
      const place = publicPlaces().find((candidate) => candidate.slug === slug);
      expect(place, `${slug} should be published`).toBeDefined();
      expect(matchesCraving(grocery, place!), `${slug} should answer Grocery`).toBe(true);
    }
  });
});
