import { describe, expect, it, vi } from "vitest";
import type { SelectedPlacePhotoRecord } from "@/lib/selected-place-photo-credit";

const fixtures = vi.hoisted(() => {
  const credit = {
    photo_name: "places/ChIJtest/photos/photo-one",
    google_maps_uri: "https://www.google.com/maps/photos/photo-one",
    flag_content_uri: "https://www.google.com/maps/report/photo-one",
    authors: [{
      display_name: "Actual photographer",
      uri: "https://www.google.com/maps/contrib/123",
      photo_uri: "https://example.com/actual-profile.jpg",
    }],
  };
  return {
    credit,
    // Independently known SHA-256 oracle from the binding contract tests.
    storedCredit: {
      photo_name_sha256: "730d30022cf9032684340fb3a68606f0eb36140923ffe6c05a01a6aff3b31e33",
      google_maps_uri: credit.google_maps_uri,
      flag_content_uri: credit.flag_content_uri,
      authors: credit.authors,
    },
  };
});

vi.mock("@/data/event-venue-photo-credits.json", () => ({
  default: { "indexed-place": fixtures.storedCredit },
}));
vi.mock("@/data/photo-suppress.json", () => ({
  default: { slugs: ["suppressed-place"] },
}));
vi.mock("@/data/places-overrides.json", () => ({
  default: {
    patch: {
      "clear-photo-place": { clearPhoto: true },
      "clear-enrichment-place": { clearEnrichment: true },
    },
  },
}));

import { selectedPlacePhoto, withPrimaryGooglePhotoCredit } from "./selectedPlacePhoto";

function place(slug: string): SelectedPlacePhotoRecord & { name: string; unrelated: { keep: boolean } } {
  return {
    slug,
    name: "The selected place",
    google_photo_url: `/api/place-photo?name=${encodeURIComponent(fixtures.credit.photo_name)}&w=800&slug=${slug}`,
    google_photo_policy_passed: true,
    unrelated: { keep: true },
  };
}

describe("strict primary Google photo projection", () => {
  it("restores the full exact credit from a compact server index without mutating the catalog row", () => {
    const original = Object.freeze(place("indexed-place"));
    const result = withPrimaryGooglePhotoCredit(original);

    expect(result).toEqual({
      ...original,
      google_photo_attribution: fixtures.credit,
    });
    expect(result.google_photo_attribution).not.toHaveProperty("photo_name_sha256");
    expect(result.unrelated).toBe(original.unrelated);
    expect(original).not.toHaveProperty("google_photo_attribution");
    expect(fixtures.storedCredit).not.toHaveProperty("photo_name");
  });

  it("keeps the bound embedded photo name, author, profile, source and report fields together", () => {
    const original = Object.freeze({
      ...place("embedded-place"),
      google_photo_attribution: fixtures.credit,
    });
    const selected = selectedPlacePhoto(original.slug, original)!;
    const result = withPrimaryGooglePhotoCredit(original);

    expect(result.google_photo_url).toBe(selected.url);
    expect(result.google_photo_attribution).toEqual(selected.attribution);
    expect(JSON.parse(JSON.stringify(result.google_photo_attribution))).toEqual(fixtures.credit);
    expect(original.google_photo_attribution).toBe(fixtures.credit);
  });

  it.each([
    "suppressed-place",
    "clear-photo-place",
    "clear-enrichment-place",
  ])("removes both stale Google halves when current editorial policy rejects %s", (slug) => {
    const original = Object.freeze({ ...place(slug), google_photo_attribution: fixtures.credit });
    const result = withPrimaryGooglePhotoCredit(original);
    expect(result.google_photo_url).toBeUndefined();
    expect(result.google_photo_attribution).toBeUndefined();
    expect(result.name).toBe(original.name);
    expect(result.unrelated).toBe(original.unrelated);
    expect(original.google_photo_url).toContain(`/api/place-photo?`);
    expect(original.google_photo_attribution).toBe(fixtures.credit);
  });

  it.each([
    { google_photo_policy_passed: false },
    { google_photo_url: "/api/place-photo?name=places%2FChIJtest%2Fphotos%2Fphoto-one&slug=other-place" },
    { google_photo_attribution: { ...fixtures.credit, photo_name: "places/ChIJtest/photos/another" } },
    { google_photo_attribution: { ...fixtures.credit, google_maps_uri: "https://www.google.com/maps/place/?q=place_id:ChIJtest" } },
    { google_photo_attribution: { ...fixtures.credit, photo_name_sha256: "0".repeat(64) } },
  ])("does not leave a rejected embedded URL or credit available to client photo plans: %j", (patch) => {
    const result = withPrimaryGooglePhotoCredit({
      ...place("embedded-place"),
      google_photo_attribution: fixtures.credit,
      ...patch,
    });
    expect(result.google_photo_url).toBeUndefined();
    expect(result.google_photo_attribution).toBeUndefined();
  });

  it("does not reuse an indexed credit after the same place changes photo resource", () => {
    const original = place("indexed-place");
    const result = withPrimaryGooglePhotoCredit({
      ...original,
      google_photo_url: original.google_photo_url!.replace("photo-one", "photo-two"),
    });
    expect(result.google_photo_url).toBeUndefined();
    expect(result.google_photo_attribution).toBeUndefined();
  });

  it("removes an unbound paid URL even when no credit exists", () => {
    const result = withPrimaryGooglePhotoCredit(place("unindexed-place"));
    expect(result.google_photo_url).toBeUndefined();
    expect(result.google_photo_attribution).toBeUndefined();
  });

  it.each(["/images/actual-owned-photo.jpg", "https://example.com/publisher-photo.jpg", undefined])(
    "preserves non-Google photo behavior for %s without inventing credit", (url) => {
      const original = Object.freeze({ ...place("owned-place"), google_photo_url: url });
      expect(withPrimaryGooglePhotoCredit(original)).toBe(original);
      const stale = { ...original, google_photo_attribution: fixtures.credit };
      const result = withPrimaryGooglePhotoCredit(stale);
      expect(result.google_photo_url).toBe(url);
      expect(result.google_photo_attribution).toBeUndefined();
      expect(result.unrelated).toBe(original.unrelated);
    },
  );
});
