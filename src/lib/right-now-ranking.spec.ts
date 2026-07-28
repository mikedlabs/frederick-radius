import { describe, expect, it } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import {
  canUseOriginForRanking,
  compareRightNowCandidates,
  rightNowQualityScore,
  rightNowSortLabel,
  smartNearbyScore,
} from "./right-now-ranking";

const place = (name: string, values: Partial<PlaceCardData> = {}) => ({
  name,
  feature_score: 5,
  ...values,
}) as PlaceCardData;

describe("right-now no-origin ranking", () => {
  it("trusts deliberate origins for ranking but not a coarse IP centroid", () => {
    expect(canUseOriginForRanking("device")).toBe(true);
    expect(canUseOriginForRanking("town")).toBe(true);
    expect(canUseOriginForRanking("home")).toBe(true);
    expect(canUseOriginForRanking("ip")).toBe(false);
    expect(canUseOriginForRanking("county")).toBe(false);
    expect(canUseOriginForRanking("none")).toBe(false);
  });

  it("uses quality signals instead of preserving dataset order", () => {
    const thin = place("Thin listing", { feature_score: 4 });
    const strong = place("Strong local", {
      feature_score: 9,
      google_rating: 4.7,
      google_rating_count: 240,
      google_photo_url: "/photo.jpg",
      local_favorite: true,
      open_confidence: "verified",
      short_blurb: "A well documented local favorite.",
    });
    expect(rightNowQualityScore(strong)).toBeGreaterThan(rightNowQualityScore(thin));

    const ranked = [thin, strong]
      .map((p) => ({ p, dist: Infinity, open: true }))
      .sort((a, b) => compareRightNowCandidates(a, b, "nearest", false));
    expect(ranked.map(({ p }) => p.name)).toEqual(["Strong local", "Thin listing"]);
  });

  it("does not let a coarse IP distance override quality", () => {
    const nearThin = place("Nearby only by IP", { feature_score: 2 });
    const fartherStrong = place("Strong local choice", {
      feature_score: 9,
      google_rating: 4.7,
      google_rating_count: 240,
      local_favorite: true,
      short_blurb: "A well documented local favorite.",
    });
    const ranked = [
      { p: nearThin, dist: 200, open: true },
      { p: fartherStrong, dist: 5_000, open: true },
    ].sort((a, b) => compareRightNowCandidates(a, b, "nearest", false));
    expect(ranked[0]?.p.name).toBe("Strong local choice");
  });

  it("balances proximity, trust, and local knowledge in Smart Nearby", () => {
    const closeThin = place("Close but thin", { slug: "close", feature_score: 2 });
    const useful = place("Useful local", {
      slug: "useful",
      feature_score: 8,
      local_favorite: true,
      open_confidence: "verified",
      is_verified: true,
      field_notes: true,
      short_blurb: "A source-backed local note.",
    });
    const context = { hasOrigin: true };
    expect(
      smartNearbyScore({ p: useful, dist: 1_200, open: true }, context),
    ).toBeGreaterThan(
      smartNearbyScore({ p: closeThin, dist: 100, open: true }, context),
    );
  });

  it("uses saves as a soft personal nudge without overriding availability", () => {
    const saved = place("Saved choice", { slug: "saved", feature_score: 6 });
    const other = place("Other choice", { slug: "other", feature_score: 6 });
    const ranked = [
      { p: other, dist: 500, open: true },
      { p: saved, dist: 500, open: true },
    ].sort((a, b) =>
      compareRightNowCandidates(a, b, "smart", true, {
        savedSlugs: new Set(["saved"]),
      }),
    );
    expect(ranked[0]?.p.slug).toBe("saved");
  });

  it("never moves a closed place above an open place", () => {
    const open = place("Open but modest", { feature_score: 3 });
    const closed = place("Closed but famous", {
      feature_score: 10,
      google_rating: 5,
      google_rating_count: 1_000,
      local_favorite: true,
    });
    const ranked = [
      { p: closed, dist: 1, open: false },
      { p: open, dist: 10_000, open: true },
    ].sort((a, b) => compareRightNowCandidates(a, b, "nearest", false));
    expect(ranked[0]?.p.name).toBe("Open but modest");
  });

  it("puts places with real review evidence ahead of unrated places in Top rated", () => {
    const unrated = place("Unrated", { feature_score: 10, local_favorite: true });
    const rated = place("Known 3.9", {
      feature_score: 3,
      google_rating: 3.9,
      google_rating_count: 120,
    });
    const ranked = [unrated, rated]
      .map((p) => ({ p, dist: Infinity, open: true }))
      .sort((a, b) => compareRightNowCandidates(a, b, "rated", false));
    expect(ranked.map(({ p }) => p.name)).toEqual(["Known 3.9", "Unrated"]);
  });

  it("labels the availability tier instead of promising a false nearest-first list", () => {
    expect(rightNowSortLabel("smart", true, true)).toBe("open first, then best fit");
    expect(rightNowSortLabel("nearest", true, true)).toBe("open first, then nearest");
    expect(rightNowSortLabel("nearest", true, false)).toBe("nearest first");
    expect(rightNowSortLabel("rated", false, true)).toBe("open first, then top rated");
  });
});
