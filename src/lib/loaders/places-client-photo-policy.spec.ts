import { describe, expect, it } from "vitest";
import type { PlaceCardData } from "./places";
import { withoutUnpublishableGooglePhoto } from "./places-client";

const photoName = "places/ChIJtest/photos/photo-one";
const photoUrl = `/api/place-photo?name=${encodeURIComponent(photoName)}&w=800`;

function place(
  overrides: Partial<PlaceCardData> & {
    google_photo_policy_passed?: true;
  } = {},
): PlaceCardData & { google_photo_policy_passed?: true } {
  return {
    slug: "test-place",
    name: "Test Place",
    category: "coffee",
    city: "Frederick",
    municipality: "frederick",
    geom: { lng: -77.41, lat: 39.414 },
    google_photo_url: photoUrl,
    ...overrides,
  } as PlaceCardData & { google_photo_policy_passed?: true };
}

describe("client Google photo release guard", () => {
  it("strips a legacy photo that has no exact individual-source metadata", () => {
    expect(withoutUnpublishableGooglePhoto(place()).google_photo_url).toBeUndefined();
  });

  it("keeps a photo stamped by the canonical build-time policy", () => {
    const value = place({
      google_photo_policy_passed: true,
    });
    expect(withoutUnpublishableGooglePhoto(value).google_photo_url).toBe(photoUrl);
  });
});
