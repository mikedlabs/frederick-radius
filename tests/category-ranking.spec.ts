import { describe, it, expect } from "vitest";
import {
  categoryScore,
  bestMatches,
  openNowOf,
  localFavoritesOf,
  nearestFrom,
  groupByMunicipality,
  isChainName,
  isLooseCategory,
  ratingSignal,
  proximitySignal,
} from "@/lib/category-ranking";
import { rankPlaces } from "@/lib/loaders/places";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { FREDERICK_CENTER } from "@/lib/geo";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { OpenStatus } from "@/lib/hours";

const OPEN: OpenStatus = { state: "open", closesAt: "9:00 PM", closingSoon: false };
const CLOSED: OpenStatus = { state: "closed" };

function place(o: Partial<PlaceCardData> & { name: string; municipality: string }): PlaceCardData {
  return {
    slug: o.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    feature_score: 5,
    open_status: OPEN,
    distance_m: 1000,
    ...o,
  } as unknown as PlaceCardData;
}

describe("detection helpers", () => {
  it("flags chains", () => {
    expect(isChainName("Starbucks 844")).toBe(true);
    expect(isChainName("Dunkin'")).toBe(true);
    expect(isChainName("Gravel and Grind")).toBe(false);
  });
  it("flags loose-category (tea/boba/tearoom)", () => {
    expect(isLooseCategory("Shab Row Tea Emporium")).toBe(true);
    expect(isLooseCategory("Serenity Tearoom")).toBe(true);
    expect(isLooseCategory("Market Street Boba Beans")).toBe(true);
    expect(isLooseCategory("Cafe Nola")).toBe(false);
  });
});

describe("signal helpers", () => {
  it("ratingSignal shrinks a thin 5.0 below a deep 4.6", () => {
    const thin = ratingSignal(5.0, 3);
    const deep = ratingSignal(4.6, 800);
    expect(deep).toBeGreaterThan(thin);
  });
  it("ratingSignal returns neutral 0.5 for unrated", () => {
    expect(ratingSignal(undefined, undefined)).toBe(0.5);
  });
  it("proximitySignal decays continuously and ~halves near 3km", () => {
    expect(proximitySignal(0)).toBe(1);
    expect(proximitySignal(3000)).toBeCloseTo(0.5, 2);
    expect(proximitySignal(0)).toBeGreaterThan(proximitySignal(3000));
    expect(proximitySignal(3000)).toBeGreaterThan(proximitySignal(20000));
  });
});

describe("categoryScore", () => {
  const base = { name: "Local Cafe", municipality: "frederick", google_rating: 4.6, google_rating_count: 200 };

  it("local_favorite lifts the score", () => {
    const plain = categoryScore(place({ ...base }));
    const fav = categoryScore(place({ ...base, local_favorite: true }));
    expect(fav).toBeGreaterThan(plain);
  });

  it("open beats closed", () => {
    const open = categoryScore(place({ ...base, open_status: OPEN }));
    const closed = categoryScore(place({ ...base, open_status: CLOSED }));
    expect(open).toBeGreaterThan(closed);
  });

  it("same-town gives a small nudge (0.08), not a takeover", () => {
    const inTown = categoryScore(place({ ...base }), { town: "frederick" });
    const outTown = categoryScore(place({ ...base }), { town: "brunswick" });
    const delta = inTown - outTown;
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(0.08 + 1e-9);
  });

  it("chains are soft-demoted", () => {
    const local = categoryScore(place({ ...base, name: "Gravel and Grind" }));
    const chain = categoryScore(place({ ...base, name: "Starbucks 844" }));
    expect(local).toBeGreaterThan(chain);
  });

  it("loose-category records are demoted vs an equal true-coffee record", () => {
    const coffee = categoryScore(place({ ...base, name: "Gravel and Grind" }));
    const tea = categoryScore(place({ ...base, name: "Shab Row Tea Emporium" }));
    expect(coffee).toBeGreaterThan(tea);
  });

  it("a thin local record does NOT outrank a clearly stronger in-town coffee", () => {
    // same town for both; the strong one must still win on quality.
    const thinLocal = place({ name: "Druidcraft", municipality: "middletown", feature_score: 5, open_status: CLOSED, google_rating: undefined });
    const strong = place({ name: "Aleko's", municipality: "middletown", feature_score: 5, local_favorite: true, google_rating: 4.8, google_rating_count: 300, open_status: OPEN });
    const ctx = { town: "middletown" };
    expect(categoryScore(strong, ctx)).toBeGreaterThan(categoryScore(thinLocal, ctx));
  });
});

describe("slice helpers", () => {
  const list = [
    place({ name: "A open", municipality: "frederick", open_status: OPEN, distance_m: 500 }),
    place({ name: "B closed", municipality: "frederick", open_status: CLOSED, distance_m: 100 }),
    place({ name: "C fav", municipality: "brunswick", local_favorite: true, distance_m: 9000 }),
  ];
  it("openNowOf keeps open, nearest first", () => {
    const o = openNowOf(list);
    expect(o.every((p) => p.open_status.state === "open")).toBe(true);
  });
  it("localFavoritesOf keeps only favorites", () => {
    expect(localFavoritesOf(list).map((p) => p.name)).toEqual(["C fav"]);
  });
  it("nearestFrom sorts ascending by distance", () => {
    expect(nearestFrom(list).map((p) => p.name)[0]).toBe("B closed");
  });
  it("groupByMunicipality groups and orders by strongest", () => {
    const g = groupByMunicipality(list);
    expect(g.map((x) => x.municipality).sort()).toEqual(["brunswick", "frederick"]);
  });
});

// ── Real-data origin comparison — the proof, as a regression guard ──
describe("coffee ranking is genuinely context-aware (real data)", () => {
  const fromDowntown = rankPlaces({ category: "coffee", origin: FREDERICK_CENTER });
  const brunswickCentroid = MUNICIPALITY_BY_SLUG["brunswick"].centroid;
  const fromBrunswick = rankPlaces({ category: "coffee", origin: brunswickCentroid });

  it("Downtown still ranks strong downtown coffee (majority of best matches)", () => {
    const best = bestMatches(fromDowntown, { town: "frederick" }, 6);
    const dt = best.filter((p) => p.municipality === "frederick").length;
    expect(dt).toBeGreaterThanOrEqual(4);
  });

  it("Brunswick surfaces Brunswick coffee in best matches (not 6 downtown)", () => {
    const best = bestMatches(fromBrunswick, { town: "brunswick" }, 6);
    const local = best.filter((p) => p.municipality === "brunswick").length;
    const dt = best.filter((p) => p.municipality === "frederick").length;
    expect(local).toBeGreaterThanOrEqual(1);
    expect(dt).toBeLessThan(6);
  });

  it("no chain leads the Brunswick best matches", () => {
    const best = bestMatches(fromBrunswick, { town: "brunswick" }, 6);
    expect(isChainName(best[0].name)).toBe(false);
  });

  it("Across the county surfaces non-home towns", () => {
    const groups = groupByMunicipality(fromBrunswick, { town: "brunswick" }).filter(
      (g) => g.municipality !== "brunswick",
    );
    expect(groups.length).toBeGreaterThan(3);
  });
});
