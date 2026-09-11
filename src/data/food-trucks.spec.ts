import { describe, expect, it } from "vitest";
import { FOOD_TRUCKS, truckFeedUrl, type FoodTruck } from "./food-trucks";

function truck(overrides: Partial<FoodTruck>): FoodTruck {
  return {
    slug: "test-truck",
    name: "Test Truck",
    cuisine: "Test food",
    kind: "food",
    ...overrides,
  };
}

describe("food-truck roster", () => {
  it("keeps every truck on a unique stable slug", () => {
    const slugs = FOOD_TRUCKS.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("prefers a same-day social feed over a general website", () => {
    expect(
      truckFeedUrl(
        truck({
          website: "https://example.com",
          instagram: "https://instagram.com/example",
          facebook: "https://facebook.com/example",
        }),
      ),
    ).toBe("https://instagram.com/example");
  });

  it("falls back from Instagram to Facebook, then the website", () => {
    expect(truckFeedUrl(truck({ facebook: "https://facebook.com/example", website: "https://example.com" }))).toBe(
      "https://facebook.com/example",
    );
    expect(truckFeedUrl(truck({ website: "https://example.com" }))).toBe("https://example.com");
    expect(truckFeedUrl(truck({}))).toBeNull();
  });

  it("keeps a current location link on every public roster entry", () => {
    expect(FOOD_TRUCKS.filter((entry) => !truckFeedUrl(entry))).toEqual([]);
  });

  it("publishes only permission-backed vendor photos with a visible credit", () => {
    const incomplete = FOOD_TRUCKS.filter(
      (entry) =>
        entry.media &&
        (!entry.media.credit.trim() ||
          !entry.media.alt.trim() ||
          !["owner-approved", "licensed"].includes(entry.media.permission)),
    );
    expect(incomplete).toEqual([]);
  });
});
