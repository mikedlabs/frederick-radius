import { describe, expect, it } from "vitest";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { publicPlaces } from "@/lib/loaders/places";
import { openNowNameQualifiers } from "./name-qualifiers";

describe("openNowNameQualifiers", () => {
  it("names the town for namesakes in different towns, using the town's display name", () => {
    const qualifiers = openNowNameQualifiers([
      { slug: "safeway-middletown", name: "Safeway", municipality: "middletown", address: "815 E Main St" },
      {
        slug: "safeway-walkersville", name: "Safeway", municipality: "walkersville",
        address: "151 Walkers Village Way, Walkersville, MD 21793",
      },
      { slug: "food-lion-thurmont", name: "Food Lion", municipality: "thurmont", address: "231 Tippin Dr" },
      { slug: "food-lion-yellow-springs", name: "Food Lion", municipality: "frederick", address: "2060 Yellow Springs Rd" },
      { slug: "food-lion-crestwood", name: "Food Lion", municipality: "frederick", address: "6920 Crestwood Blvd" },
      { slug: "only-one", name: "Only One", municipality: "frederick", address: "1 Market St" },
    ]);
    expect(qualifiers.get("safeway-middletown")).toBe("Middletown");
    expect(qualifiers.get("safeway-walkersville")).toBe("Walkersville");
    expect(qualifiers.get("food-lion-thurmont")).toBe("Thurmont");
    // Two stores in one town are told apart by street instead.
    expect(qualifiers.get("food-lion-yellow-springs")).toBe("2060 Yellow Springs Rd");
    expect(qualifiers.get("food-lion-crestwood")).toBe("6920 Crestwood Blvd");
    // A name that does not repeat on the page keeps a plain row.
    expect(qualifiers.has("only-one")).toBe(false);
  });

  it("leaves a store plain when its namesake is not among the rows passed in", () => {
    const qualifiers = openNowNameQualifiers([
      { slug: "safeway-middletown", name: "Safeway", municipality: "middletown", address: "815 E Main St" },
    ]);
    expect(qualifiers.size).toBe(0);
  });

  it("gives every repeated name in the published catalog a row that reads differently", () => {
    // The page can print any subset of the catalog, and namesakes are only
    // qualified when both are on the page. Check the hardest case: every
    // place that shares its name with another is on the page at once.
    const places = publicPlaces();
    const key = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();
    const counts = new Map<string, number>();
    for (const place of places) counts.set(key(place.name), (counts.get(key(place.name)) ?? 0) + 1);
    const repeated = places.filter((place) => (counts.get(key(place.name)) ?? 0) > 1);
    expect(repeated.length).toBeGreaterThan(1);
    const qualifiers = openNowNameQualifiers(repeated);
    const seen = new Map<string, string>();
    const identical: string[] = [];
    for (const place of repeated) {
      const row = [place.name, CATEGORY_BY_SLUG[place.category]?.name ?? place.category, qualifiers.get(place.slug)]
        .filter(Boolean)
        .join(" · ");
      const other = seen.get(row);
      if (other) identical.push(`${other} and ${place.slug} both read "${row}"`);
      else seen.set(row, place.slug);
    }
    expect(identical).toEqual([]);
  });
});
