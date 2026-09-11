import { describe, expect, it } from "vitest";
import { isRecommendable } from "@/lib/relevance";
import { getPlaceBySlug, rankPlaces } from "./places";

describe("place detail nearby recommendations", () => {
  it("does not promote institutions that remain available in search and map", () => {
    const place = getPlaceBySlug("brewers-alley-frederick");

    expect(place).not.toBeNull();
    expect(place?.nearby_places.length).toBeGreaterThan(0);
    expect(place?.nearby_places.every(isRecommendable)).toBe(true);
    expect(
      place?.nearby_places.some(
        (nearby) => nearby.slug === "st-johns-catholic-prep-school",
      ),
    ).toBe(false);
  });

  it("pairs a coffee stop with relevant nearby destinations before personal services", () => {
    const place = getPlaceBySlug("frederick-coffee-company-frederick");

    expect(place).not.toBeNull();
    expect(place?.nearby_places[0]?.slug).toBe("beans-bagels-frederick");
    expect(
      place?.nearby_places.some((nearby) => nearby.category === "salon"),
    ).toBe(false);
  });
});

describe("location-aware place ranking", () => {
  it("puts Gravel & Grind first when the reader is standing beside it", () => {
    const coffee = rankPlaces({
      category: "coffee",
      origin: { lng: -77.40955, lat: 39.42165 },
      originSource: "device",
    });

    expect(coffee[0]?.slug).toBe("gravel-and-grind-frederick");
    expect(coffee[0]?.distance_m).toBeLessThan(50);
    expect(
      coffee.findIndex((place) => /^starbucks\b/i.test(place.name)),
    ).toBeGreaterThan(0);
  });
});
