import { describe, expect, it } from "vitest";
import {
  breweryMediaCoverage,
  resolvePublishableBreweryPhoto,
} from "./brewery-media";

const slug = "test-brewery";
const photoName = "places/ChIJtest/photos/photo-one";

describe("brewery media publishing", () => {
  it("uses the no-store photo route only with exact individual attribution", () => {
    const attribution = {
      photo_name: photoName,
      google_maps_uri: "https://www.google.com/maps/photos/photo-one",
      authors: [{ display_name: "Local photographer" }],
    };
    const asset = resolvePublishableBreweryPhoto(slug, {
      photo_names: [photoName],
      photo_attributions: [attribution],
    });

    expect(asset).toEqual({
      src:
        "/api/place-photo?name=places%2FChIJtest%2Fphotos%2Fphoto-one&w=1200&slug=test-brewery&fallback=signal",
      attribution,
    });
    expect(asset?.src).not.toContain("blob.vercel-storage.com");
  });

  it("does not treat a legacy name or place-level source as publishable", () => {
    expect(
      resolvePublishableBreweryPhoto(slug, {
        photo_names: [photoName],
      }),
    ).toBeNull();
    expect(
      resolvePublishableBreweryPhoto(slug, {
        photo_names: [photoName],
        photo_attributions: [
          {
            photo_name: photoName,
            google_maps_uri:
              "https://www.google.com/maps/place/?q=place_id:ChIJtest",
            authors: [],
          },
        ],
      }),
    ).toBeNull();
  });

  it("keeps unattributed source candidates separate from publishable coverage", () => {
    const coverage = breweryMediaCoverage();
    expect(coverage.breweries).toBe(17);
    expect(coverage.photoCandidates).toBe(16);
    expect(coverage.noPhotoCandidate).toBe(1);
    expect(coverage.publishable).toBeLessThanOrEqual(
      coverage.photoCandidates,
    );
    expect(coverage.waitingForAttribution).toBe(
      coverage.photoCandidates - coverage.publishable,
    );
  });
});
