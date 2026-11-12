import { NEARBY_DISTANCE_WINDOW_M } from "@/lib/decision/nearby-place-ranking";
import { describe, expect, it } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import {
  canUseOriginForRanking,
  compareRightNowCandidates,
  resolveRightNowAvailabilityMode,
  rightNowQualityScore,
  rightNowHasOpenTier,
  rightNowOrderSentence,
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

  it("downgrades required hours to a bonus when coverage cannot support open-first", () => {
    expect(resolveRightNowAvailabilityMode("required", false)).toBe("bonus");
    expect(resolveRightNowAvailabilityMode("required", true)).toBe("required");
    expect(resolveRightNowAvailabilityMode("bonus", false)).toBe("bonus");
    expect(resolveRightNowAvailabilityMode("not-applicable", false)).toBe("not-applicable");
  });

  it("lets a nearby unknown-hours place beat a far confirmed-open place in flexible mode", () => {
    const nearbyUnknown = place("Around the corner", {
      feature_score: 4,
      open_status: { state: "unknown" },
    });
    const farOpen = place("Eleven miles away", {
      feature_score: 10,
      google_rating: 4.9,
      google_rating_count: 900,
      local_favorite: true,
      open_status: { state: "open", closesAt: "23:00", closingSoon: false },
    });
    const ranked = [
      { p: farOpen, dist: 17_700, open: true },
      { p: nearbyUnknown, dist: 180, open: false },
    ].sort((a, b) =>
      compareRightNowCandidates(a, b, "smart", true, {}, "bonus"),
    );
    expect(ranked[0]?.p.name).toBe("Around the corner");
  });

  it("still places a confirmed closure after a nearby unknown-hours option", () => {
    const unknown = place("Hours unknown", {
      open_status: { state: "unknown" },
    });
    const closed = place("Confirmed closed", {
      feature_score: 10,
      open_status: { state: "closed" },
    });
    const ranked = [
      { p: closed, dist: 10, open: false },
      { p: unknown, dist: 300, open: false },
    ].sort((a, b) =>
      compareRightNowCandidates(a, b, "nearest", true, {}, "bonus"),
    );
    expect(ranked[0]?.p.name).toBe("Hours unknown");
  });

  it("keeps the manual Nearest sort literal inside a close-call quality window", () => {
    const closest = place("Closest", {
      slug: "closest",
      feature_score: 0,
      google_rating: 3.5,
      google_rating_count: 1,
      open_status: { state: "unknown" },
    });
    const richer = place("Richer", {
      slug: "richer",
      feature_score: 10,
      google_rating: 5,
      google_rating_count: 1_000,
      local_favorite: true,
      open_status: { state: "unknown" },
    });
    const ranked = [
      { p: richer, dist: 149, open: false },
      { p: closest, dist: 1, open: false },
    ].sort((a, b) =>
      compareRightNowCandidates(a, b, "nearest", true, {}, "bonus"),
    );

    expect(ranked.map(({ p }) => p.slug)).toEqual(["closest", "richer"]);
  });

  it("lets close by win over a far confirmed-open place when an origin exists", () => {
    const nearbyUnknown = place("Nearby unknown", {
      open_status: { state: "unknown" },
    });
    const farOpen = place("Far open", {
      open_status: { state: "open", closesAt: "23:00", closingSoon: false },
    });
    for (const sort of ["smart", "nearest"] as const) {
      const ranked = [
        { p: farOpen, dist: 10_000, open: true },
        { p: nearbyUnknown, dist: 100, open: false },
      ].sort((a, b) =>
        compareRightNowCandidates(a, b, sort, true, {}, "required"),
      );
      expect(ranked.map(({ p }) => p.name)).toEqual(["Nearby unknown", "Far open"]);
    }
    expect(rightNowHasOpenTier("required", true)).toBe(false);
  });

  it("still sinks a confirmed closure below a farther open place when an origin exists", () => {
    const nearbyClosed = place("Nearby closed", {
      open_status: { state: "closed" },
    });
    const farOpen = place("Far open", {
      open_status: { state: "open", closesAt: "23:00", closingSoon: false },
    });
    const ranked = [
      { p: nearbyClosed, dist: 100, open: false },
      { p: farOpen, dist: 10_000, open: true },
    ].sort((a, b) =>
      compareRightNowCandidates(a, b, "smart", true, {}, "required"),
    );
    expect(ranked.map(({ p }) => p.name)).toEqual(["Far open", "Nearby closed"]);
  });

  it("keeps the confirmed-open tier for required hours when no origin can rank by distance", () => {
    const strongUnknown = place("Strong unknown", {
      open_status: { state: "unknown" },
      feature_score: 10,
      local_favorite: true,
    });
    const plainOpen = place("Plain open", {
      open_status: { state: "open", closesAt: "23:00", closingSoon: false },
    });
    const ranked = [
      { p: strongUnknown, dist: Infinity, open: false },
      { p: plainOpen, dist: Infinity, open: true },
    ].sort((a, b) =>
      compareRightNowCandidates(a, b, "smart", false, {}, "required"),
    );
    expect(ranked[0]?.p.name).toBe("Plain open");
    expect(rightNowHasOpenTier("required", false)).toBe(true);
    expect(rightNowHasOpenTier("bonus", false)).toBe(false);
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

  it("describes the order it shows in one complete sentence", () => {
    const none = { openFirst: false, closedLast: false };
    // "The same block" describes the comparator's 150 m distance window.
    expect(NEARBY_DISTANCE_WINDOW_M).toBe(150);
    expect(rightNowOrderSentence("smart", true, none)).toBe(
      "The closest places come first, and places on the same block are ordered by best match.",
    );
    expect(rightNowOrderSentence("nearest", true, none)).toBe(
      "Places are sorted by distance, nearest first.",
    );
    expect(rightNowOrderSentence("rated", true, none)).toBe("The top rated places come first.");
    expect(rightNowOrderSentence("smart", false, none)).toBe("The best matches come first.");
    expect(rightNowOrderSentence("nearest", false, none)).toBe("The best matches come first.");
    expect(rightNowOrderSentence("smart", true, { openFirst: false, closedLast: true })).toBe(
      "The closest places come first, and places on the same block are ordered by best match. Places confirmed closed come last.",
    );
    expect(rightNowOrderSentence("smart", false, { openFirst: true, closedLast: true })).toBe(
      "Places confirmed open come first, then the best matches.",
    );
    expect(rightNowOrderSentence("rated", false, { openFirst: true, closedLast: false })).toBe(
      "Places confirmed open come first, then the top rated.",
    );
  });
});
