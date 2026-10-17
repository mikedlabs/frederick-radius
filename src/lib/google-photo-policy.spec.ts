import { describe, expect, it } from "vitest";
import {
  browseSafePhotoUrl,
  googlePhotoNameFromProxyUrl,
  isPaidGooglePhotoUrl,
  publishableGooglePhotoAttribution,
  publishableGooglePhotoNames,
} from "./google-photo-policy";

const photoName = "places/ChIJtest/photos/photo-one";

describe("Google photo publishing policy", () => {
  it("requires exact metadata and an individual Google Maps source", () => {
    const credit = {
      photo_name: photoName,
      google_maps_uri: "https://www.google.com/maps/photos/photo-one",
      authors: [{ display_name: "A photographer" }],
    };
    expect(publishableGooglePhotoAttribution(photoName, [credit])).toEqual(credit);
    expect(publishableGooglePhotoNames([photoName], [credit])).toEqual([photoName]);
    expect(googlePhotoNameFromProxyUrl(
      `/api/place-photo?name=${encodeURIComponent(photoName)}&w=800`,
    )).toBe(photoName);
  });

  it("binds a nameless list credit to the URL-derived resource and rejects a different name", () => {
    const slim = {
      google_maps_uri: "https://www.google.com/maps/photos/photo-one",
      authors: [{ display_name: "A photographer" }],
    };
    expect(publishableGooglePhotoAttribution(photoName, [slim as never], { bindUnnamedToUrl: true }))
      .toEqual({ ...slim, photo_name: photoName });
    expect(publishableGooglePhotoAttribution(photoName, [slim as never])).toBeUndefined();
    expect(publishableGooglePhotoAttribution("places/ChIJtest/photos/other", [{
      photo_name: photoName,
      google_maps_uri: slim.google_maps_uri,
      authors: slim.authors,
    }], { bindUnnamedToUrl: true })).toBeUndefined();
  });

  it("rejects legacy names, place-level fallbacks, and mismatched credits", () => {
    expect(publishableGooglePhotoNames([photoName], [])).toEqual([]);
    expect(publishableGooglePhotoNames([photoName], [{
      photo_name: photoName,
      google_maps_uri: "https://www.google.com/maps/place/?q=place_id:ChIJtest",
      authors: [],
    }])).toEqual([]);
    expect(publishableGooglePhotoNames([photoName], [{
      photo_name: "places/ChIJtest/photos/different",
      google_maps_uri: "https://www.google.com/maps/photos/different",
      authors: [],
    }])).toEqual([]);
  });

  it("keeps paid Google imagery out of automatic browse surfaces", () => {
    const proxy = `/api/place-photo?name=${encodeURIComponent(photoName)}&w=800`;

    expect(isPaidGooglePhotoUrl(proxy)).toBe(true);
    expect(isPaidGooglePhotoUrl("https://places.googleapis.com/v1/photo/media")).toBe(true);
    expect(isPaidGooglePhotoUrl("https://lh3.googleusercontent.com/photo")).toBe(true);
    expect(isPaidGooglePhotoUrl("/images/owned/coffee.jpg")).toBe(false);
    expect(browseSafePhotoUrl(proxy, "/images/owned/coffee.jpg")).toBe(
      "/images/owned/coffee.jpg",
    );
    expect(browseSafePhotoUrl(proxy)).toBeUndefined();
  });
});
