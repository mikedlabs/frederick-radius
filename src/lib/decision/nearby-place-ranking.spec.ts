import { describe, expect, it } from "vitest";
import {
  compareNearbyPlaceCandidates,
  nearbyPlaceEvidenceBand,
  type NearbyPlaceCandidate,
  type NearbyRankablePlace,
} from "./nearby-place-ranking";

function candidate(
  slug: string,
  distance: number,
  values: Partial<NearbyRankablePlace> & {
    quality?: number;
  } = {},
): NearbyPlaceCandidate<NearbyRankablePlace> {
  const { quality, ...place } = values;
  return {
    place: {
      slug,
      name: slug,
      confidence: "verified",
      feature_score: 5,
      ...place,
    },
    distance,
    quality,
  };
}

describe("evidence-aware nearby ranking", () => {
  it("keeps distance monotonic among credible places even when the farther row is richer", () => {
    const close = candidate("close-credible", 180, { quality: 0.25 });
    const far = candidate("far-richer", 8_400, { quality: 0.95 });

    const ranked = [far, close].sort((a, b) =>
      compareNearbyPlaceCandidates(a, b, "device"),
    );

    expect(ranked.map(({ place }) => place.slug)).toEqual([
      "close-credible",
      "far-richer",
    ]);
  });

  it("does not let an unreviewed row become the lead solely because it is closer", () => {
    const bare = candidate("generic-playground", 25, {
      confidence: "scraped",
      is_verified: false,
      quality: 0,
    });
    const credible = candidate("confirmed-park", 900, { quality: 0.4 });

    const ranked = [bare, credible].sort((a, b) =>
      compareNearbyPlaceCandidates(a, b, "device"),
    );

    expect(ranked[0]?.place.slug).toBe("confirmed-park");
  });

  it("does not import a far confirmed result ahead of an unreviewed nearby option", () => {
    const nearby = candidate("nearby-unreviewed", 50, {
      confidence: "scraped",
      is_verified: false,
      quality: 0,
    });
    const remote = candidate("remote-confirmed", 5_000, { quality: 0.9 });

    const ranked = [remote, nearby].sort((a, b) =>
      compareNearbyPlaceCandidates(a, b, "device"),
    );

    expect(ranked[0]?.place.slug).toBe("nearby-unreviewed");
  });

  it("allows editorial quality to settle a genuinely close call", () => {
    const ordinary = candidate("ordinary", 100, { quality: 0.4 });
    const standout = candidate("standout", 140, {
      local_favorite: true,
      quality: 0.9,
    });

    expect(nearbyPlaceEvidenceBand(ordinary.place)).toBe(1);
    expect(nearbyPlaceEvidenceBand(standout.place)).toBe(1);

    const ranked = [ordinary, standout].sort((a, b) =>
      compareNearbyPlaceCandidates(a, b, "device"),
    );
    expect(ranked.map(({ place }) => place.slug)).toEqual(["standout", "ordinary"]);
  });

  it("does not let a far editorial standout leapfrog a credible nearby place", () => {
    const nearby = candidate("nearby", 300, { quality: 0.4 });
    const farStandout = candidate("far-standout", 5_000, {
      local_favorite: true,
      field_notes: true,
      feature_score: 10,
      quality: 1,
    });

    const ranked = [farStandout, nearby].sort((a, b) =>
      compareNearbyPlaceCandidates(a, b, "device"),
    );

    expect(ranked[0]?.place.slug).toBe("nearby");
  });

  it("uses quality rather than a coarse network distance when the origin is not trustworthy", () => {
    const close = candidate("close-by-ip", 100, { quality: 0.2 });
    const useful = candidate("useful", 5_000, { quality: 0.8 });

    const ranked = [close, useful].sort((a, b) =>
      compareNearbyPlaceCandidates(a, b, "ip"),
    );

    expect(ranked[0]?.place.slug).toBe("useful");
  });

  it("is transitive across the old distance-guardrail cycle", () => {
    const rows = [
      candidate("near-thin", 400, { quality: 0.2 }),
      candidate("middle-rich", 2_700, { quality: 0.9 }),
      candidate("far-medium", 4_000, { quality: 0.6 }),
    ];
    const expected = ["near-thin", "middle-rich", "far-medium"];
    const permutations = [
      rows,
      [rows[0], rows[2], rows[1]],
      [rows[1], rows[0], rows[2]],
      [rows[1], rows[2], rows[0]],
      [rows[2], rows[0], rows[1]],
      [rows[2], rows[1], rows[0]],
    ];

    for (const permutation of permutations) {
      expect(
        [...permutation]
          .sort((a, b) => compareNearbyPlaceCandidates(a, b, "device"))
          .map(({ place }) => place.slug),
      ).toEqual(expected);
    }
  });
});
