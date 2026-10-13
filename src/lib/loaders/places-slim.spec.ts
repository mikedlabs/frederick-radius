import { describe, expect, it } from "vitest";
import { isCravingPlace } from "@/data/cravings";
import { isRecommendable } from "@/lib/relevance";
import {
  decoratePlace,
  publicPlaces,
  slimForList,
  slimForNearby,
  type PlaceCardData,
} from "./places";

const photoName = "places/verified/photos/exact-hero";
const attributedPlace = {
  ...decoratePlace(publicPlaces().find((place) => isCravingPlace(place))!),
  google_photo_url: `/api/place-photo?name=${encodeURIComponent(photoName)}&w=800`,
  google_photo_attribution: { photo_name: photoName,
    google_maps_uri: "https://www.google.com/maps/place/Verified/data=!3m1!1e3",
    authors: [{ display_name: "Exact photo author", uri: "https://www.google.com/maps/contrib/123" }] },
  google_photo_attributions: [{ photo_name: photoName, google_maps_uri: "https://www.google.com/maps/place/Verified/data=!3m1!1e3", authors: [] }],
  google_photos: ["/one.jpg", "/two.jpg"], google_hours: ["Monday: 9:00 AM to 5:00 PM"],
} as PlaceCardData;

describe("attributed list photo payload", () => {
  it("carries the exact single hero metadata with its canonical photo and still omits heavy arrays", () => {
    const slim = slimForList(attributedPlace);
    expect(slim.google_photo_url).toBe(attributedPlace.google_photo_url);
    expect(slim.google_photo_attribution).toEqual(attributedPlace.google_photo_attribution);
    expect(slim.google_photo_attribution?.photo_name).toBe(photoName);
    expect(slim).not.toHaveProperty("google_photo_attributions");
    expect(slim).not.toHaveProperty("google_photos");
    expect(slim).not.toHaveProperty("google_hours");
    expect(attributedPlace.google_photo_attributions).toHaveLength(1);
  });

  it("does not reintroduce hero or attribution metadata into the nearby payload", () => {
    const slim = slimForNearby(attributedPlace);
    expect(slim).not.toHaveProperty("google_photo_url");
    expect(slim).not.toHaveProperty("google_photo_attribution");
    expect(slim).not.toHaveProperty("google_photo_attributions");
    expect(slim).not.toHaveProperty("google_photos");
    expect(slim).not.toHaveProperty("google_hours");
    expect(slim.geom).toEqual(attributedPlace.geom);
    expect(slim.open_status).toEqual(attributedPlace.open_status);
  });
});

describe("nearby place payload", () => {
  it("omits detail-only photo credits, reviews, and schedules", () => {
    const full = decoratePlace(
      publicPlaces().find((place) => isCravingPlace(place))!,
    );
    const slim = slimForNearby(full);

    expect(slim.slug).toBe(full.slug);
    expect(slim.geom).toEqual(full.geom);
    expect(slim.open_status).toEqual(full.open_status);
    expect(slim).not.toHaveProperty("google_photo_attribution");
    expect(slim).not.toHaveProperty("google_photo_attributions");
    expect(slim).not.toHaveProperty("google_photos");
    expect(slim).not.toHaveProperty("google_hours");
    expect(slim).not.toHaveProperty("review_snippet");
    expect(slim).not.toHaveProperty("hours");
  });

  it("keeps the countywide decision payload below its regression budget", () => {
    const places = publicPlaces()
      .filter(isRecommendable)
      .filter(isCravingPlace)
      .map((place) => slimForNearby(decoratePlace(place)));

    expect(places.length).toBeGreaterThan(1_000);
    expect(Buffer.byteLength(JSON.stringify(places))).toBeLessThan(2_250_000);
  });
});
