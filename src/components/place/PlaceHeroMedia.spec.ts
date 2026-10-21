import { describe, expect, it } from "vitest";
import PlaceHero from "./PlaceHero";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";
import { recordPlaceCardPhotoResult, selectedPlaceCardPhoto } from "@/lib/place-card-photo";
import {
  isPlacePhotoFailureSignal,
  placePhotoFailureSignalSrc,
} from "./PlaceHeroMedia";

describe("PlaceHeroMedia photo-state contract", () => {
  it("asks the paid photo proxy for a detectable failure signal", () => {
    expect(
      placePhotoFailureSignalSrc(
        "/api/place-photo?name=places%2Fone%2Fphotos%2Ftwo&w=1200&slug=test",
      ),
    ).toBe(
      "/api/place-photo?name=places%2Fone%2Fphotos%2Ftwo&w=1200&slug=test&fallback=signal",
    );
  });

  it("leaves non-proxy photos untouched", () => {
    expect(placePhotoFailureSignalSrc("https://commons.wikimedia.org/photo.jpg"))
      .toBe("https://commons.wikimedia.org/photo.jpg");
  });

  it("distinguishes the transparent proxy signal from real photography", () => {
    expect(isPlacePhotoFailureSignal({ naturalWidth: 1, naturalHeight: 1 }))
      .toBe(true);
    expect(isPlacePhotoFailureSignal({ naturalWidth: 1200, naturalHeight: 800 }))
      .toBe(false);
  });
});


describe("Place detail hero selects reviewed local licensed bytes", () => {
  it.each(Object.entries(CREDITED_LOCAL_PLACE_PHOTOS))("passes the exact %s source and full credit to its real media boundary before eligible Google", (slug, { image }) => {
    const photoName = `places/${slug}/photos/eligible`;
    const hero = PlaceHero({ slug, name: slug, category: "museum",
      photoSrc: `/api/place-photo?name=${encodeURIComponent(photoName)}&w=1200`,
      photoAttribution: { photo_name: photoName, google_maps_uri: `https://www.google.com/maps/place/${slug}/data=!3m1!1e3`, authors: [] } });
    const plan = hero.props.plan;
    expect(plan.sources[0]).toMatchObject({ kind: "curated", src: image.src, alt: image.alt,
      photo: { author: image.creator, source_url: image.source_url, license: image.license.label,
        licenseUrl: image.license.url, modifications: image.modifications } });
    const failed = recordPlaceCardPhotoResult(plan, null, image.src, "failed");
    expect(selectedPlaceCardPhoto(plan, failed)?.kind).toBe(slug === "barbara-fritchie-house-frederick" ? undefined : "google");
  });
});
