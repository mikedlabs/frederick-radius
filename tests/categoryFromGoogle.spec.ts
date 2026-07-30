import { describe, it, expect } from "vitest";
import { categoryFromPrimaryType } from "@/lib/categoryFromGoogle";

describe("categoryFromPrimaryType", () => {
  it("corrects the exact cases the owner reported", () => {
    // Gravel & Grind — Google knows it's a coffee shop (name has no
    // "coffee", so no heuristic could ever catch it).
    expect(categoryFromPrimaryType("coffee_shop")).toBe("coffee");
    // Visitation Hotel — a hotel, regardless of its in-house coffee.
    expect(categoryFromPrimaryType("hotel")).toBe("lodging");
    expect(categoryFromPrimaryType("lodging")).toBe("lodging");
  });

  it("maps the common Frederick types to our taxonomy", () => {
    expect(categoryFromPrimaryType("cafe")).toBe("coffee");
    expect(categoryFromPrimaryType("italian_restaurant")).toBe("restaurant");
    expect(categoryFromPrimaryType("pizza_restaurant")).toBe("pizza");
    expect(categoryFromPrimaryType("bakery")).toBe("bakery");
    expect(categoryFromPrimaryType("bar")).toBe("bar");
    expect(categoryFromPrimaryType("church")).toBe("worship");
    expect(categoryFromPrimaryType("place_of_worship")).toBe("worship");
    expect(categoryFromPrimaryType("park")).toBe("park");
    expect(categoryFromPrimaryType("museum")).toBe("museum");
    expect(categoryFromPrimaryType("library")).toBe("library");
    expect(categoryFromPrimaryType("yoga_studio")).toBe("yoga");
    expect(categoryFromPrimaryType("gym")).toBe("yoga");
    expect(categoryFromPrimaryType("antique_store")).toBe("antiques");
    expect(categoryFromPrimaryType("clothing_store")).toBe("shopping");
  });

  it("is case/whitespace tolerant", () => {
    expect(categoryFromPrimaryType("  Coffee_Shop ")).toBe("coffee");
  });

  it("maps the audit-driven uncovered types to real categories", () => {
    // Health & body → wellness catch-all; personal care → its own buckets
    expect(categoryFromPrimaryType("medical_clinic")).toBe("wellness");
    expect(categoryFromPrimaryType("doctor")).toBe("wellness");
    expect(categoryFromPrimaryType("dentist")).toBe("wellness");
    expect(categoryFromPrimaryType("hair_salon")).toBe("salon");
    expect(categoryFromPrimaryType("beauty_salon")).toBe("salon");
    expect(categoryFromPrimaryType("barber_shop")).toBe("salon");
    expect(categoryFromPrimaryType("massage")).toBe("massage");
    expect(categoryFromPrimaryType("spa")).toBe("spa");
    // Community → civic
    expect(categoryFromPrimaryType("non_profit_organization")).toBe("civic");
    expect(categoryFromPrimaryType("association_or_organization")).toBe("civic");
    // Practical services with dedicated discovery categories
    expect(categoryFromPrimaryType("bank")).toBe("services");
    expect(categoryFromPrimaryType("car_repair")).toBe("auto-care");
    // Retail → shopping
    expect(categoryFromPrimaryType("liquor_store")).toBe("shopping");
    expect(categoryFromPrimaryType("convenience_store")).toBe("shopping");
    expect(categoryFromPrimaryType("parking_garage")).toBe("parking");
  });

  it("keeps wine and spirits out of the brewery category", () => {
    expect(categoryFromPrimaryType("winery")).toBe("winery");
    expect(categoryFromPrimaryType("cidery")).toBe("winery");
    expect(categoryFromPrimaryType("meadery")).toBe("winery");
    expect(categoryFromPrimaryType("distillery")).toBe("distillery");
  });

  it("returns null for vague/unknown types so curated stays put", () => {
    expect(categoryFromPrimaryType("point_of_interest")).toBe(null);
    expect(categoryFromPrimaryType("establishment")).toBe(null);
    expect(categoryFromPrimaryType("store")).toBe(null);
    expect(categoryFromPrimaryType("food")).toBe(null);
    expect(categoryFromPrimaryType("service")).toBe(null);
    expect(categoryFromPrimaryType("premise")).toBe(null);
    expect(categoryFromPrimaryType("manufacturer")).toBe(null);
    expect(categoryFromPrimaryType("")).toBe(null);
    expect(categoryFromPrimaryType(undefined)).toBe(null);
    expect(categoryFromPrimaryType(null)).toBe(null);
  });
});
