import { describe, expect, it } from "vitest";
import { clientPlaceBySlug, clientPlaces } from "@/lib/loaders/places-client";
import { publishablePlaceWebsite } from "@/lib/place-website-policy";

describe("client place website policy", () => {
  it("replaces the scraped Starbucks directory with its accepted official site", () => {
    expect(clientPlaceBySlug("starbucks-844")?.website).toMatch(
      /^https:\/\/(?:www\.)?starbucks\.com\//,
    );
  });

  it("never exposes a known third-party host as the Website action", () => {
    for (const place of clientPlaces()) {
      if (place.website) {
        expect(
          publishablePlaceWebsite(place.website, place.name),
        ).toBe(place.website);
      }
    }
  });
});
