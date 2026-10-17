import { describe, expect, it, vi } from "vitest";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { createMapListPhotoLoader } from "@/components/map/map-list-photo-loader";
import { placeCardPhotoPlan } from "@/lib/place-card-photo";
import {
  googlePhotoNameFromProxyUrl,
  publishableGooglePhotoAttribution,
} from "@/lib/google-photo-policy";
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

  it("restores complete identity-bound primary credits without adding gallery payloads", () => {
    const slugs = ["gravel-and-grind-frederick", "beans-in-the-belfry-brunswick"];
    const snapshots = slugs.map((slug) => clientPlaceBySlug(slug)!);
    const places = resolvePlacesBySlugs(slugs);

    expect(places.map((place) => place.slug)).toEqual(slugs);
    for (const [index, place] of places.entries()) {
      const name = googlePhotoNameFromProxyUrl(place.google_photo_url!);
      const attribution = place.google_photo_attribution;
      expect(name).toBeTruthy();
      expect(attribution?.photo_name).toBe(name);
      expect(attribution?.authors.length).toBeGreaterThan(0);
      expect(publishableGooglePhotoAttribution(name!, [attribution!]))
        .toBe(attribution);
      expect(attribution).not.toHaveProperty("photo_name_sha256");
      expect(place).not.toHaveProperty("google_photos");
      expect(place).not.toHaveProperty("google_photo_attributions");
      expect(place.google_photo_url).toBe(snapshots[index].google_photo_url);
      expect(place.name).toBe(snapshots[index].name);
      expect(snapshots[index].google_photo_attribution).toBeUndefined();
    }
  });

  it("keeps one exact primary photo and its full credit through serialized lazy hydration", async () => {
    const [resolved] = resolvePlacesBySlugs(["gravel-and-grind-frederick"]);
    const responseBody = JSON.parse(JSON.stringify({ places: [resolved] }));
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => responseBody }));
    const loader = createMapListPhotoLoader({ fetcher, batchDelayMs: 60_000 });
    const pending = loader.loadData(resolved.slug);
    await loader.flush();
    const photoData = await pending;

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(photoData).not.toBeNull();
    expect(photoData?.google_photo_url).toBe(resolved.google_photo_url);
    expect(photoData?.google_photo_attribution).toEqual(resolved.google_photo_attribution);
    const plan = placeCardPhotoPlan({ ...resolved, ...photoData! }, 180);
    expect(plan.sources).toHaveLength(1);
    const [hero] = plan.sources;
    expect(hero.kind).toBe("google");
    if (hero.kind !== "google") throw new Error("Expected the exact primary Google photo");
    expect(hero.attribution).toEqual(resolved.google_photo_attribution);
    expect(googlePhotoNameFromProxyUrl(hero.src)).toBe(resolved.google_photo_attribution!.photo_name);
    expect(hero.attribution.google_maps_uri).toBe(resolved.google_photo_attribution!.google_maps_uri);
    expect(hero.attribution.authors).toEqual(resolved.google_photo_attribution!.authors);
    expect(responseBody.places[0]).not.toHaveProperty("google_photos");
    expect(responseBody.places[0]).not.toHaveProperty("google_photo_attributions");
  });

  it("preserves an owned-photo destination without inventing Google metadata", () => {
    const [place] = resolvePlacesBySlugs(["carroll-creek-linear-park-frederick"]);
    expect(place.slug).toBe("carroll-creek-linear-park-frederick");
    expect(place.google_photo_url).toBeUndefined();
    expect(place.google_photo_attribution).toBeUndefined();
  });

  it("caps pathological requests before catalog lookup", () => {
    const slugs = normalizeRequestedPlaceSlugs(
      Array.from({ length: MAX_PLACES_BY_SLUG + 25 }, (_, index) =>
        `place-${index}`,
      ).join(","),
    );

    expect(slugs).toHaveLength(MAX_PLACES_BY_SLUG);
  });
});
