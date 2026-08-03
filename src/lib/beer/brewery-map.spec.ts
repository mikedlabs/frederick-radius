import { describe, expect, it } from "vitest";
import { BREWERIES } from "@/data/beers";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { slimForList, type PlaceCardData } from "@/lib/loaders/places";
import { breweryMapBounds, breweryTownCounts } from "./brewery-map";

function breweryPlaces(): PlaceCardData[] {
  return BREWERIES.map((brewery) => clientPlaceBySlug(brewery.slug))
    .filter((place): place is PlaceCardData => Boolean(place))
    .map(slimForList);
}

describe("brewery map", () => {
  it("has one unique, mappable marker for every brewery guide", () => {
    const places = breweryPlaces();

    expect(places).toHaveLength(BREWERIES.length);
    expect(new Set(places.map((place) => place.slug)).size).toBe(
      BREWERIES.length,
    );
    expect(
      places.every(
        (place) =>
          Number.isFinite(place.geom.lng) &&
          Number.isFinite(place.geom.lat),
      ),
    ).toBe(true);
  });

  it("keeps photo attribution details out of list payloads", () => {
    const full = {
      ...breweryPlaces()[0],
      google_photo_attribution: {
        photo_name: "places/example/photos/one",
        google_maps_uri: "https://maps.google.com/example",
        authors: [{ display_name: "Photographer" }],
      },
      google_photo_attributions: [
        {
          photo_name: "places/example/photos/one",
          google_maps_uri: "https://maps.google.com/example",
          authors: [{ display_name: "Photographer" }],
        },
      ],
      google_photos: ["/one.jpg", "/two.jpg"],
      google_hours: ["Monday: 9:00 AM to 5:00 PM"],
    } as PlaceCardData;

    const slim = slimForList(full);

    expect(slim.google_photo_url).toBe(full.google_photo_url);
    expect(slim).not.toHaveProperty("google_photo_attribution");
    expect(slim).not.toHaveProperty("google_photo_attributions");
    expect(slim).not.toHaveProperty("google_photos");
    expect(slim).not.toHaveProperty("google_hours");
  });

  it("opens on bounds containing every brewery instead of a downtown default", () => {
    const places = breweryPlaces();
    const bounds = breweryMapBounds(places);

    expect(bounds).not.toBeNull();
    const [[west, south], [east, north]] = bounds!;
    for (const place of places) {
      expect(place.geom.lng).toBeGreaterThanOrEqual(west);
      expect(place.geom.lng).toBeLessThanOrEqual(east);
      expect(place.geom.lat).toBeGreaterThanOrEqual(south);
      expect(place.geom.lat).toBeLessThanOrEqual(north);
    }

    // The current guide genuinely spans the county. This catches a regression
    // back to a downtown-only camera even if every marker still exists in data.
    expect(east - west).toBeGreaterThan(0.4);
    expect(north - south).toBeGreaterThan(0.2);
  });

  it("summarizes every marker in the town legend", () => {
    const places = breweryPlaces();
    const counts = breweryTownCounts(places);

    expect(counts.reduce((sum, item) => sum + item.count, 0)).toBe(
      BREWERIES.length,
    );
    expect(counts[0]).toEqual({
      municipality: "frederick",
      count: 11,
    });
  });

  it("pads a one-brewery map into a usable neighborhood frame", () => {
    const bounds = breweryMapBounds([
      {
        slug: "one",
        name: "One Brewery",
        municipality: "frederick",
        geom: { lng: -77.41, lat: 39.42 },
      },
    ]);

    expect(bounds).not.toBeNull();
    expect(bounds![0][0]).toBeCloseTo(-77.425);
    expect(bounds![0][1]).toBeCloseTo(39.408);
    expect(bounds![1][0]).toBeCloseTo(-77.395);
    expect(bounds![1][1]).toBeCloseTo(39.432);
  });
});
