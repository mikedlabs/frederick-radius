import { describe, expect, it } from "vitest";
import {
  bindSelectedPlacePhotoCredit,
  compactGooglePhotoCredit,
  type SelectedPlacePhotoRecord,
} from "./selected-place-photo-credit";

// Metadata fixtures exercise identity boundaries, not real provider health.
const slug = "selected-place";
const name = "places/ChIJtest/photos/photo-one";
const url = "/api/place-photo?name=" + encodeURIComponent(name) + "&w=800&slug=" + slug;
const credit = {
  photo_name: name,
  google_maps_uri: "https://www.google.com/maps/photos/photo-one",
  flag_content_uri: "https://www.google.com/maps/report/photo-one",
  authors: [{
    display_name: "A photographer",
    uri: "https://www.google.com/maps/contrib/123",
    photo_uri: "https://example.com/profile.jpg",
  }],
};
// Fixed SHA-256 oracle independently checked with Python hashlib, not the
// compactor under test: UTF-8 "places/ChIJtest/photos/photo-one", no newline.
const originalNameSha256 = "730d30022cf9032684340fb3a68606f0eb36140923ffe6c05a01a6aff3b31e33";
const storedCredit = {
  photo_name_sha256: originalNameSha256,
  google_maps_uri: credit.google_maps_uri,
  flag_content_uri: credit.flag_content_uri,
  authors: credit.authors,
};
const place: SelectedPlacePhotoRecord = {
  slug,
  google_photo_url: url,
  google_photo_policy_passed: true,
};

describe("compact stored Google photo credit", () => {
  it("stores the independently known identity digest and restores the exact public credit after JSON serialization", () => {
    const stored = compactGooglePhotoCredit(credit);
    expect(stored).toEqual(storedCredit);
    expect(stored).not.toHaveProperty("photo_name");
    const reloaded = JSON.parse(JSON.stringify(stored));
    expect(bindSelectedPlacePhotoCredit(slug, place, reloaded)).toEqual({
      url,
      attribution: credit,
    });
  });

  it("keeps supplied authors and drops unsafe optional profile/report links", () => {
    const result = compactGooglePhotoCredit({
      ...credit,
      flag_content_uri: "javascript:alert(1)",
      authors: [
        { display_name: " A photographer ", uri: "javascript:alert(1)" },
        { uri: "https://www.google.com/maps/contrib/456" },
        null,
        "unstructured",
      ],
    });
    expect(result).toEqual({
      ...storedCredit,
      flag_content_uri: undefined,
      authors: [
        { display_name: "A photographer", uri: undefined, photo_uri: undefined },
        { display_name: undefined, uri: "https://www.google.com/maps/contrib/456", photo_uri: undefined },
      ],
    });
  });

  it.each([
    ["missing identity", { google_maps_uri: credit.google_maps_uri, authors: [] }],
    ["malformed identity", { ...credit, photo_name: "legacy-photo-reference" }],
    ["generic place lookup", { ...credit, google_maps_uri: "https://www.google.com/maps/place/?q=place_id:ChIJtest" }],
    ["foreign source", { ...credit, google_maps_uri: "https://example.com/maps/photos/photo-one" }],
    ["insecure source", { ...credit, google_maps_uri: "http://www.google.com/maps/photos/photo-one" }],
  ])("rejects %s without inventing a source", (_label, candidate) => {
    expect(compactGooglePhotoCredit(candidate)).toBeUndefined();
  });
});

describe("compact identity binding", () => {
  it("binds an independently supplied digest without inventing author/source fields", () => {
    expect(bindSelectedPlacePhotoCredit(slug, place, storedCredit)).toEqual({ url, attribution: credit });
    expect(storedCredit).not.toHaveProperty("photo_name");
  });

  it("rejects a compact roundtrip when the same selected place points to a different resource", () => {
    const reloaded = JSON.parse(JSON.stringify(compactGooglePhotoCredit(credit)));
    const otherUrl = url.replace(encodeURIComponent(name), encodeURIComponent("places/ChIJtest/photos/photo-two"));
    expect(bindSelectedPlacePhotoCredit(slug, { ...place, google_photo_url: otherUrl }, reloaded)).toBeUndefined();
  });

  it.each([
    ["wrong well-formed digest", "0".repeat(64)],
    ["short digest", originalNameSha256.slice(0, 63)],
    ["uppercase digest", originalNameSha256.toUpperCase()],
    ["nonhex digest", "z".repeat(64)],
    ["undefined digest", undefined],
    ["null digest", null],
    ["numeric digest", 1],
  ])("rejects %s rather than publishing a reconstructed identity", (_label, digest) => {
    expect(bindSelectedPlacePhotoCredit(slug, place, { ...storedCredit, photo_name_sha256: digest })).toBeUndefined();
  });

  it("keeps digest-less legacy stored metadata unavailable", () => {
    const { photo_name_sha256: _digest, ...legacy } = storedCredit;
    void _digest;
    expect(bindSelectedPlacePhotoCredit(slug, place, legacy)).toBeUndefined();
  });

  it("accepts matching full and digest proofs without exposing the stored digest", () => {
    expect(bindSelectedPlacePhotoCredit(slug, place, { ...credit, photo_name_sha256: originalNameSha256 }))
      .toEqual({ url, attribution: credit });
  });

  it.each([
    { ...credit, photo_name_sha256: "0".repeat(64) },
    { ...credit, photo_name_sha256: "malformed" },
    { ...storedCredit, photo_name: "places/ChIJtest/photos/another-photo" },
    { ...storedCredit, photo_name: undefined },
  ])("rejects conflicting or malformed mixed proofs even when one would match", (mixed) => {
    expect(bindSelectedPlacePhotoCredit(slug, place, mixed)).toBeUndefined();
  });

  it("does not compact conflicting mixed metadata into a new accepted proof", () => {
    expect(compactGooglePhotoCredit({ ...credit, photo_name_sha256: "0".repeat(64) })).toBeUndefined();
    expect(compactGooglePhotoCredit(storedCredit)).toBeUndefined();
  });

  it.each([
    "https://www.google.com/maps/place/?q=place_id:ChIJtest",
    "https://example.com/maps/photos/photo-one",
    "http://www.google.com/maps/photos/photo-one",
  ])("rechecks individual source policy for a valid digest with source %s", (source) => {
    expect(bindSelectedPlacePhotoCredit(slug, place, { ...storedCredit, google_maps_uri: source })).toBeUndefined();
  });

  it("does not mutate a frozen compact source when restoring the public name", () => {
    const frozen = Object.freeze({ ...storedCredit });
    expect(bindSelectedPlacePhotoCredit(slug, Object.freeze({ ...place }), frozen)).toEqual({ url, attribution: credit });
    expect(frozen).toEqual(storedCredit);
    expect(frozen).not.toHaveProperty("photo_name");
  });
});

describe("selected place and photo ownership", () => {
  it("retains the selected proxy and every accepted credit field together", () => {
    expect(bindSelectedPlacePhotoCredit(slug, place, credit)).toEqual({
      url,
      attribution: credit,
    });
  });

  it("does not let another canonical slug inherit the selected record", () => {
    expect(bindSelectedPlacePhotoCredit("other-place", place, credit)).toBeUndefined();
    expect(bindSelectedPlacePhotoCredit("other-place", place, storedCredit)).toBeUndefined();
  });

  it("rejects an exact same-place credit for a different resource", () => {
    expect(bindSelectedPlacePhotoCredit(slug, place, {
      ...credit,
      photo_name: "places/ChIJtest/photos/old-photo",
    })).toBeUndefined();
  });

  it("keeps legacy missing-identity metadata unavailable", () => {
    const { photo_name: _identity, ...legacy } = credit;
    void _identity;
    expect(bindSelectedPlacePhotoCredit(slug, place, legacy)).toBeUndefined();
  });

  it.each([undefined, false, 1, "true"])("requires exact true approval, rejecting %s", (approval) => {
    expect(bindSelectedPlacePhotoCredit(slug, {
      ...place,
      google_photo_policy_passed: approval,
    }, credit)).toBeUndefined();
    expect(bindSelectedPlacePhotoCredit(slug, { ...place, google_photo_policy_passed: approval }, storedCredit)).toBeUndefined();
  });

  it("does not resurrect a suppressed or missing URL from its old credit", () => {
    expect(bindSelectedPlacePhotoCredit(slug, {
      ...place,
      google_photo_url: undefined,
    }, credit)).toBeUndefined();
    expect(bindSelectedPlacePhotoCredit(slug, { ...place, google_photo_url: undefined }, storedCredit)).toBeUndefined();
  });

  it.each([
    ["noncanonical absolute app URL", "https://frederickradius.app" + url],
    ["noncanonical app-relative path", "/another-path/../api/place-photo?" + url.split("?")[1]],
    ["foreign origin", "https://example.com" + url],
    ["foreign protocol-relative origin", "//example.com" + url],
    ["insecure origin", "http://frederickradius.app" + url],
    ["foreign path", "/api/another-photo?name=" + encodeURIComponent(name) + "&slug=" + slug],
    ["wrong slug", url.replace("slug=" + slug, "slug=other-place")],
    ["missing slug", url.replace("&slug=" + slug, "")],
    ["duplicate slug", url + "&slug=" + slug],
    ["duplicate name", url + "&name=" + encodeURIComponent(name)],
    ["fragment", url + "#another-photo"],
    ["invalid resource", "/api/place-photo?name=legacy-ref&slug=" + slug],
  ])("rejects %s before publishing either half", (_label, candidate) => {
    expect(bindSelectedPlacePhotoCredit(slug, {
      ...place,
      google_photo_url: candidate,
    }, credit)).toBeUndefined();
    expect(bindSelectedPlacePhotoCredit(slug, { ...place, google_photo_url: candidate }, storedCredit)).toBeUndefined();
  });

  it("does not mutate the selected record or overwrite stored resource identity", () => {
    const frozenPlace = Object.freeze({ ...place });
    const frozenCredit = Object.freeze({ ...credit });
    bindSelectedPlacePhotoCredit(slug, frozenPlace, frozenCredit);
    expect(frozenPlace).toEqual(place);
    expect(frozenCredit).toEqual(credit);
  });
});
