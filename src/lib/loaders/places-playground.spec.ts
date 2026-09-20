import { describe, expect, it } from "vitest";
import { rankPlaces } from "@/lib/loaders/places";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import {
  NEARBY_DISTANCE_WINDOW_M,
  NEARBY_UNREVIEWED_PENALTY_M,
  nearbyPlaceEvidenceBand,
} from "@/lib/decision/nearby-place-ranking";

describe("playground category evidence", () => {
  it("includes parent parks whose source-backed blurbs name a playground", () => {
    const slugs = new Set(
      rankPlaces({ category: "playground" }).map((place) => place.slug),
    );

    expect(slugs).toContain("riverwalk-park-frederick");
    expect(slugs).toContain("willowdale-park-frederick");
    expect(slugs).toContain("pinecliff-park-frederick");
    expect(slugs).toContain("middletown-park-middletown");
    expect(slugs).toContain("urbana-district-park-new-market");
    expect(slugs).toContain("utica-park-walkersville");
    expect(slugs).toContain("baker-park-frederick");
  });

  it("keeps downtown playground results proximity-monotonic outside close-call windows", () => {
    const ranked = rankPlaces({
      category: "playground",
      origin: { lng: -77.4105, lat: 39.4143 },
      originSource: "device",
    });

    const parkPlayground = ranked.findIndex(
      (place) => place.slug === "park-playground-frederick",
    );
    const walkersville = ranked.findIndex(
      (place) =>
        place.slug ===
        "walkersville-community-park-playground-walkersville",
    );
    expect(parkPlayground).toBeGreaterThanOrEqual(0);
    expect(walkersville).toBeGreaterThan(parkPlayground);
    expect(
      ranked.slice(0, 8).every((place) => place.municipality === "frederick"),
    ).toBe(true);

    for (let index = 1; index < ranked.length; index += 1) {
      const previous = ranked[index - 1];
      const current = ranked[index];
      const previousBand = nearbyPlaceEvidenceBand(previous);
      const currentBand = nearbyPlaceEvidenceBand(current);
      const previousWindow = Math.floor((
        (previous.distance_m ?? Infinity) +
        (previousBand === 0 ? NEARBY_UNREVIEWED_PENALTY_M : 0)
      ) / NEARBY_DISTANCE_WINDOW_M);
      const currentWindow = Math.floor((
        (current.distance_m ?? Infinity) +
        (currentBand === 0 ? NEARBY_UNREVIEWED_PENALTY_M : 0)
      ) / NEARBY_DISTANCE_WINDOW_M);
      expect(currentWindow).toBeGreaterThanOrEqual(previousWindow);
      if (currentWindow === previousWindow) {
        expect(currentBand).toBeLessThanOrEqual(previousBand);
      }
    }
  });

  it("treats a deliberately selected town as a hard result boundary", () => {
    const walkersville = MUNICIPALITY_BY_SLUG.walkersville;
    expect(walkersville).toBeDefined();

    const ranked = rankPlaces({
      category: "playground",
      municipality: "walkersville",
      origin: walkersville!.centroid,
      originSource: "town",
    });

    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.every((place) => place.municipality === "walkersville")).toBe(
      true,
    );
    expect(ranked.some((place) => place.slug === "park-playground-frederick"))
      .toBe(false);
  });
});
