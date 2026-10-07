import { describe, expect, it } from "vitest";
import { isRecommendable } from "@/lib/relevance";
import { haversineMeters } from "@/lib/geo";
import {
  getPlaceBySlug,
  pairsWithNearbyAnchor,
  publicPlaces,
  rankPlaces,
} from "./places";

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
    // Measured from the corrected 100 N East St point. The feed's rounded
    // coordinate sits 325 m west, which used to put Beans & Bagels first.
    expect(place?.nearby_places[0]?.slug).toBe("shab-row-tea-emporium");
    expect(place?.nearby_places[0]?.category).toBe("coffee");
    expect(
      place?.nearby_places.some((nearby) => nearby.category === "salon"),
    ).toBe(false);
  });

  it("ranks a takeout restaurant's Nearby by its corrected category, not the feed's", () => {
    // The DFP feed files K Town Takeout under "shopping"; decoratePlace
    // corrects it to "restaurant". Scoring the raw category led its Nearby
    // with a florist, a print shop, and a liquor store.
    const raw = publicPlaces().find((p) => p.slug === "k-town-takeout");
    expect(raw?.category).toBe("shopping");

    const place = getPlaceBySlug("k-town-takeout");
    expect(place).not.toBeNull();
    expect(place?.category).toBe("restaurant");
    expect(place?.category_name).toBe("Restaurants");

    const order = place!.nearby_places.map((nearby) => nearby.slug);
    expect(order.slice(0, 2)).toEqual(["pho-52", "charleys-restaurant"]);
    for (const errand of ["oaxaca-florist", "minuteman-press-12", "frederick-discount-liquors"]) {
      const at = order.indexOf(errand);
      if (at >= 0) expect(at).toBeGreaterThan(order.indexOf("charleys-restaurant"));
    }
  });

  it("keeps errand shops out of a food or drink page's Nearby", () => {
    for (const slug of ["k-town-takeout", "brewers-alley-frederick", "frederick-coffee-company-frederick"]) {
      const place = getPlaceBySlug(slug);
      expect(place).not.toBeNull();
      expect(
        place!.nearby_places.filter((nearby) =>
          ["print_shop", "florist", "liquor_store"].includes(nearby.primary_type ?? ""),
        ),
      ).toEqual([]);
    }
  });

  it("measures Nearby distances from the place's corrected location", () => {
    const place = getPlaceBySlug("frederick-coffee-company-frederick");
    const neighbor = place?.nearby_places.find(
      (nearby) => nearby.slug === "shab-row-tea-emporium",
    );

    expect(neighbor?.distance_m).toBeDefined();
    expect(
      Math.abs(
        neighbor!.distance_m! - haversineMeters(place!.geom, neighbor!.geom),
      ),
    ).toBeLessThan(1);
  });
});

describe("pairsWithNearbyAnchor", () => {
  it("drops errand shopping types only for food and drink anchors", () => {
    const florist = { category: "shopping", primary_type: "florist" };
    const gifts = { category: "shopping", primary_type: "gift_shop" };

    expect(pairsWithNearbyAnchor("restaurant", florist)).toBe(false);
    expect(pairsWithNearbyAnchor("brewery", { category: "shopping", primary_type: "liquor_store" })).toBe(false);
    expect(pairsWithNearbyAnchor("coffee", { category: "shopping", primary_type: "print_shop" })).toBe(false);
    expect(pairsWithNearbyAnchor("restaurant", gifts)).toBe(true);
    expect(pairsWithNearbyAnchor("gallery", florist)).toBe(true);
  });

  it("leaves a food-chapter place alone whatever Google calls it", () => {
    expect(
      pairsWithNearbyAnchor("bar", { category: "bar", primary_type: "liquor_store" }),
    ).toBe(true);
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
