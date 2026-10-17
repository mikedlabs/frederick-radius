import { describe, expect, it, vi } from "vitest";
import { clientPlaceBySlug } from "./places-client";
import { googlePhotoNameFromProxyUrl, publishableGooglePhotoAttribution } from "@/lib/google-photo-policy";
import { placeCardPhotoPlan, selectedPlaceCardPhoto } from "@/lib/place-card-photo";

vi.mock("server-only", () => ({}));

import {
  MAX_PLACES_BY_SLUG,
  normalizeRequestedPlaceSlugs,
  resolvePlacesBySlugs,
} from "./placesBySlugs";

describe("places by slugs", () => {
  it("normalizes, bounds, and deduplicates a resolved request", () => {
    const slugs = normalizeRequestedPlaceSlugs(
      " gravel-and-grind-frederick,gravel-and-grind-frederick,missing-place ",
    );
    const places = resolvePlacesBySlugs(slugs);

    expect(places.map((place) => place.slug)).toEqual([
      "gravel-and-grind-frederick",
    ]);
  });

  it("caps pathological requests before catalog lookup", () => {
    const slugs = normalizeRequestedPlaceSlugs(
      Array.from({ length: MAX_PLACES_BY_SLUG + 25 }, (_, index) =>
        `place-${index}`,
      ).join(","),
    );

    expect(slugs).toHaveLength(MAX_PLACES_BY_SLUG);
  });

  it("restores only the primary photo credit so the existing card check can publish it", () => {
    const slugs = ["cafe-nola", "gravel-and-grind-frederick"];
    const catalog = slugs.map((slug) => clientPlaceBySlug(slug)!);
    const places = resolvePlacesBySlugs(slugs);

    expect(catalog.every((place) => place.google_photo_url && !place.google_photo_attribution)).toBe(true);
    expect(places).toHaveLength(2);

    for (const place of places) {
      const name = googlePhotoNameFromProxyUrl(place.google_photo_url!);
      expect(name).toBeTruthy();
      expect(place.google_photo_attribution).not.toHaveProperty("photo_name");
      expect(place.google_photo_attribution).not.toHaveProperty("flag_content_uri");
      expect(place.google_photo_attribution).not.toHaveProperty("photo_name_sha256");
      expect(place).not.toHaveProperty("google_photo_attributions");
      const credit = publishableGooglePhotoAttribution(name!, [place.google_photo_attribution!], {
        bindUnnamedToUrl: true,
      });
      expect(credit?.photo_name).toBe(name);
      expect(credit?.google_maps_uri).toMatch(/^https:\/\/(?:www\.)?google\.com\/maps\//);
      expect(selectedPlaceCardPhoto(placeCardPhotoPlan(place, 360), null)?.kind).toBe("google");
    }

    const beforeBytes = Buffer.byteLength(JSON.stringify({ places: catalog }));
    const afterBytes = Buffer.byteLength(JSON.stringify({ places }));
    const delta = afterBytes - beforeBytes;
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThan(800);
  });

  it("does not invent a credit when the server index cannot bind one", () => {
    const [place] = resolvePlacesBySlugs(["carroll-creek-linear-park-frederick"]);
    expect(place.slug).toBe("carroll-creek-linear-park-frederick");
    expect(place.google_photo_attribution).toBeUndefined();
  });
});
