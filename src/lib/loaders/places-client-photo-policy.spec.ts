import { describe, expect, it } from "vitest";
import type { PlaceCardData } from "./places";
import { withoutUnpublishableGooglePhoto } from "./places-client";

const photoName = "places/ChIJtest/photos/photo-one";
const photoUrl = `/api/place-photo?name=${encodeURIComponent(photoName)}&w=800`;

function place(overrides: Partial<PlaceCardData> = {}): PlaceCardData {
  return {
    slug: "test-place",
    name: "Test Place",
    category: "coffee",
    city: "Frederick",
    municipality: "frederick",
    geom: { lng: -77.41, lat: 39.414 },
    google_photo_url: photoUrl,
    ...overrides,
  } as PlaceCardData;
}

describe("client Google photo release guard", () => {
  it("strips a legacy photo that has no exact individual-source metadata", () => {
    expect(withoutUnpublishableGooglePhoto(place()).google_photo_url).toBeUndefined();
  });

  it("keeps a photo whose exact metadata includes its individual source", () => {
    const value = place({
      google_photo_attribution: {
        photo_name: photoName,
        google_maps_uri: "https://www.google.com/maps/photos/photo-one",
        authors: [],
      },
    });
    expect(withoutUnpublishableGooglePhoto(value).google_photo_url).toBe(photoUrl);
  });
});
