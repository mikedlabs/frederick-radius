import { describe, expect, it } from "vitest";
import { isCravingPlace } from "@/data/cravings";
import { isRecommendable } from "@/lib/relevance";
import {
  decoratePlace,
  publicPlaces,
  slimForNearby,
} from "./places";

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
