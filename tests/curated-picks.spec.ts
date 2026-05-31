import { describe, it, expect, beforeAll } from "vitest";
import {
  ratingScore,
  curationScore,
  momentFitScore,
  resolveLocalFavorite,
  getCuratedPicks,
  rankPlaces,
} from "@/lib/loaders/places";

// Fixed Eastern moments for deterministic moment-fit assertions.
const MORNING = new Date("2026-05-31T13:00:00Z"); // 09:00 ET
const EVENING = new Date("2026-05-31T23:00:00Z"); // 19:00 ET

describe("ratingScore — Bayesian shrinkage", () => {
  it("returns the neutral midpoint when a place has no rating", () => {
    expect(ratingScore(undefined, undefined)).toBe(0.5);
  });

  it("does not let a 5.0 with a handful of reviews beat a 4.6 with hundreds", () => {
    const fewReviews = ratingScore(5.0, 3);
    const manyReviews = ratingScore(4.6, 800);
    expect(manyReviews).toBeGreaterThan(fewReviews);
  });

  it("rewards more reviews at the same rating (confidence)", () => {
    expect(ratingScore(4.7, 500)).toBeGreaterThan(ratingScore(4.7, 20));
  });

  it("stays within [0,1] across the rating range", () => {
    for (const [r, c] of [[1, 5], [3, 100], [4.5, 250], [5, 10_000]] as const) {
      const s = ratingScore(r, c);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe("curationScore — normalized + local-favorite lift", () => {
  it("normalizes the 0–10 feature score onto 0–1", () => {
    expect(curationScore(10, false)).toBeCloseTo(1, 5);
    expect(curationScore(5, false)).toBeCloseTo(0.5, 5);
    expect(curationScore(0, false)).toBeCloseTo(0, 5);
  });

  it("lifts a local favorite above an identical non-favorite", () => {
    expect(curationScore(6, true)).toBeGreaterThan(curationScore(6, false));
  });

  it("never exceeds 1 even with the local-favorite boost", () => {
    expect(curationScore(10, true)).toBeLessThanOrEqual(1);
  });
});

describe("momentFitScore — daypart affinity", () => {
  it("favors coffee in the morning over the evening", () => {
    expect(momentFitScore("coffee", MORNING)).toBeGreaterThan(
      momentFitScore("coffee", EVENING),
    );
  });

  it("favors a brewery in the evening over the morning", () => {
    expect(momentFitScore("brewery", EVENING)).toBeGreaterThan(
      momentFitScore("brewery", MORNING),
    );
  });

  it("gives a neutral, non-punishing score to off-daypart categories", () => {
    // Whatever the time, the score sits in the documented [0.6, 1] band.
    expect(momentFitScore("hardware", MORNING)).toBeGreaterThanOrEqual(0.6);
    expect(momentFitScore("hardware", MORNING)).toBeLessThanOrEqual(1);
  });
});

describe("resolveLocalFavorite — hand-pick > proxy > exclude", () => {
  it("flags a strong, well-reviewed, verified place via the data proxy", () => {
    expect(resolveLocalFavorite("some-unlisted-slug", 4.7, 200, true)).toBe(true);
  });

  it("does not flag a strong rating with too few reviews", () => {
    expect(resolveLocalFavorite("some-unlisted-slug", 5.0, 4, true)).toBe(false);
  });

  it("does not flag an unverified place", () => {
    expect(resolveLocalFavorite("some-unlisted-slug", 4.9, 500, false)).toBe(false);
  });
});

// Ranking walks the full ~1,700-place set with per-place date math, so
// each call is multi-second (the app caches it via unstable_cache). Rank
// once here and assert against the cached results to keep the suite fast.
const ORIGIN = { lng: -77.4105, lat: 39.4143 }; // downtown Frederick
describe("getCuratedPicks — the visitor short-list (integration)", () => {
  let capped: ReturnType<typeof getCuratedPicks>;
  let openOnly: ReturnType<typeof getCuratedPicks>;
  let coffee: ReturnType<typeof getCuratedPicks>;
  let legacy: string[];
  let visitor: string[];

  beforeAll(() => {
    capped = getCuratedPicks({ origin: ORIGIN, now: EVENING, limit: 8 });
    openOnly = getCuratedPicks({ origin: ORIGIN, now: EVENING, limit: 20 });
    coffee = getCuratedPicks({ origin: ORIGIN, now: MORNING, category: "coffee", limit: 10 });
    legacy = rankPlaces({ origin: ORIGIN, now: EVENING, limit: 25 }).map((p) => p.slug);
    visitor = rankPlaces({ origin: ORIGIN, now: EVENING, limit: 25, profile: "visitor" }).map(
      (p) => p.slug,
    );
  }, 60_000);

  it("returns a short, capped list", () => {
    expect(capped.length).toBeGreaterThan(0);
    expect(capped.length).toBeLessThanOrEqual(8);
  });

  it("never surfaces a closed door (preferOpen is forced on)", () => {
    for (const p of openOnly) expect(p.open_status.state).not.toBe("closed");
  });

  it("can be scoped to a craving via category", () => {
    for (const p of coffee) {
      const isCoffee = p.category === "coffee" || (p.subcategories ?? []).includes("coffee");
      expect(isCoffee).toBe(true);
    }
  });

  it("reorders the head vs the default curation-led sort", () => {
    // Both are valid orderings of the same real places; the blended
    // signals should move the head, or they're doing nothing.
    expect(visitor).not.toEqual(legacy);
  });
});
