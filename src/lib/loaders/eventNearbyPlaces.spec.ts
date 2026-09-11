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
