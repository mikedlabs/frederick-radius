import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postgis: vi.fn(),
  bySlug: vi.fn(),
  withinRadius: vi.fn(),
}));

vi.mock("@/lib/spatial/place-spatial-index", () => ({
  postgisNearbyPlaceDistances: mocks.postgis,
}));
vi.mock("@/lib/loaders/places-client", () => ({
  clientPlaceBySlug: mocks.bySlug,
  clientPlacesWithinRadius: mocks.withinRadius,
}));

import { loadEventNearbyPlaces } from "./eventNearbyPlaces";

function place(slug: string, category: string) {
  return {
    slug,
    name: slug,
    category,
    geom: { lng: -77.4105, lat: 39.4143 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadEventNearbyPlaces", () => {
  it("uses one PostGIS result for both food and parking", async () => {
    mocks.postgis.mockResolvedValue(
      new Map([
        ["cafe-nola", 120],
        ["carroll-creek-garage", 260],
        ["brewers-alley", 420],
      ]),
    );
    mocks.bySlug.mockImplementation((slug: string) => {
      if (slug === "cafe-nola") return place(slug, "restaurant");
      if (slug === "carroll-creek-garage") return place(slug, "parking");
      if (slug === "brewers-alley") return place(slug, "brewery");
      return undefined;
    });

    const result = await loadEventNearbyPlaces({
      geom: { lng: -77.41054, lat: 39.41434 },
    });

    expect(result.source).toBe("postgis");
    expect(result.food.map((row) => row.slug)).toEqual([
      "cafe-nola",
      "brewers-alley",
    ]);
    expect(result.parking.map((row) => row.slug)).toEqual([
      "carroll-creek-garage",
    ]);
    expect(mocks.withinRadius).not.toHaveBeenCalled();
  });

  it("skips coffee and bakeries before an evening show (2026-10 UI audit)", async () => {
    // An 8:30 PM event's "Around the event" line named a coffee shop.
    mocks.postgis.mockResolvedValue(
      new Map([
        ["beans-and-bagels", 60],
        ["sweet-bakery", 90],
        ["cafe-nola", 120],
        ["brewers-alley", 420],
      ]),
    );
    mocks.bySlug.mockImplementation((slug: string) => {
      if (slug === "beans-and-bagels") return place(slug, "coffee");
      if (slug === "sweet-bakery") return place(slug, "bakery");
      if (slug === "cafe-nola") return place(slug, "restaurant");
      if (slug === "brewers-alley") return place(slug, "brewery");
      return undefined;
    });

    const evening = await loadEventNearbyPlaces({
      geom: { lng: -77.4105, lat: 39.4143 },
      // 8:30 PM Eastern.
      starts_at: "2026-10-11T00:30:00.000Z",
    });
    expect(evening.food.map((row) => row.slug)).toEqual([
      "cafe-nola",
      "brewers-alley",
    ]);

    const morning = await loadEventNearbyPlaces({
      geom: { lng: -77.4105, lat: 39.4143 },
      // 9:00 AM Eastern.
      starts_at: "2026-10-10T13:00:00.000Z",
    });
    expect(morning.food[0]?.slug).toBe("beans-and-bagels");
  });

  it("applies the evening rule to the slim-catalog fallback too", async () => {
    mocks.postgis.mockResolvedValue(null);
    mocks.withinRadius.mockReturnValue([
      { ...place("beans-and-bagels", "coffee"), distance_m: 80 },
      { ...place("pizza-place", "pizza"), distance_m: 150 },
    ]);

    const result = await loadEventNearbyPlaces({
      geom: { lng: -77.4105, lat: 39.4143 },
      // 5:00 PM Eastern, the first evening minute.
      starts_at: "2026-10-10T21:00:00.000Z",
    });

    expect(result.food.map((row) => row.slug)).toEqual(["pizza-place"]);
  });

  it("falls back to the slim catalog when the spatial mirror is unavailable", async () => {
    mocks.postgis.mockResolvedValue(null);
    mocks.withinRadius.mockReturnValue([
      { ...place("beans-and-bagels", "coffee"), distance_m: 80 },
      { ...place("east-all-saints-garage", "parking"), distance_m: 300 },
    ]);

    const result = await loadEventNearbyPlaces({
      geom: { lng: -77.4105, lat: 39.4143 },
    });

    expect(result.source).toBe("catalog-fallback");
    expect(result.food[0]?.slug).toBe("beans-and-bagels");
    expect(result.parking[0]?.slug).toBe("east-all-saints-garage");
  });
});
