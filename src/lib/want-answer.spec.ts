import { describe, expect, it } from "vitest";
import { buildWantAnswer, partitionWant, rankBestFit, type WantCandidate } from "./want-answer";

function cand(over: Partial<WantCandidate> & { slug: string }): WantCandidate {
  return {
    name: over.slug,
    open_status: { state: "open", closesAt: "21:00", closingSoon: false },
    feature_score: 0,
    ...over,
  };
}

describe("partitionWant", () => {
  it("open places lead, nearest first when a fix exists", () => {
    const { open } = partitionWant([
      cand({ slug: "far", distance_m: 5000 }),
      cand({ slug: "near", distance_m: 200 }),
      cand({ slug: "mid", distance_m: 900 }),
    ]);
    expect(open.map((c) => c.slug)).toEqual(["near", "mid", "far"]);
  });

  it("feature score carries the ordering without a fix", () => {
    const { open } = partitionWant([
      cand({ slug: "quiet", feature_score: 1 }),
      cand({ slug: "landmark", feature_score: 9 }),
    ]);
    expect(open.map((c) => c.slug)).toEqual(["landmark", "quiet"]);
  });

  it("closing-soon still counts as open", () => {
    const { open } = partitionWant([
      cand({ slug: "soon", open_status: { state: "closing-soon", closesAt: "21:30" } }),
    ]);
    expect(open).toHaveLength(1);
  });

  it("opens-later-today sorts by how soon the doors open", () => {
    const { later } = partitionWant([
      cand({
        slug: "afternoon",
        open_status: { state: "closed", opensAt: "15:00", opensDay: "sat", opensToday: true },
      }),
      cand({
        slug: "morning",
        open_status: { state: "closed", opensAt: "07:00", opensDay: "sat", opensToday: true },
      }),
    ]);
    expect(later.map((c) => c.slug)).toEqual(["morning", "afternoon"]);
  });

  it("closed-until-another-day and unverified count in total only", () => {
    const { open, later, total } = partitionWant([
      cand({
        slug: "tuesday",
        open_status: { state: "closed", opensAt: "11:00", opensDay: "tue", opensToday: false },
      }),
      cand({ slug: "mystery", open_status: { state: "unverified" } }),
    ]);
    expect(open).toHaveLength(0);
    expect(later).toHaveLength(0);
    expect(total).toBe(2);
  });

  it("neither-open-nor-opening-today lands in `other`, ranked by proximity", () => {
    const { open, later, other } = partitionWant([
      cand({ slug: "open-now" }),
      cand({
        slug: "closed-far",
        distance_m: 8000,
        open_status: { state: "closed", opensAt: "09:00", opensDay: "tue", opensToday: false },
      }),
      cand({
        slug: "closed-near",
        distance_m: 300,
        open_status: { state: "unverified" },
      }),
    ]);
    expect(open.map((c) => c.slug)).toEqual(["open-now"]);
    expect(later).toHaveLength(0);
    // The notable fallback pool: nearest first, so a no-hours category
    // (markets, playgrounds) still flows down with the closest places.
    expect(other.map((c) => c.slug)).toEqual(["closed-near", "closed-far"]);
  });
});

describe("buildWantAnswer context", () => {
  it("carries an explicit town scope into both the answer and browse door", () => {
    const answer = buildWantAnswer("coffee", null, null, new Date("2026-07-15T16:00:00Z"), {
      municipality: "thurmont",
      contextLabel: "Thurmont",
      contextSource: "town",
    });
    expect(answer).not.toBeNull();
    expect(answer).toMatchObject({
      contextLabel: "Thurmont",
      contextSource: "town",
      fallbackReason: null,
    });
    expect(answer?.browseHref).toContain("town=thurmont");
  });

  it("can rank a timeless decision by local fit instead of current open state", () => {
    const ranked = rankBestFit([
      cand({ slug: "open-chain", name: "Dunkin'", feature_score: 5, google_rating: 4.1 }),
      cand({
        slug: "closed-local",
        name: "Local Deli",
        feature_score: 5,
        local_favorite: true,
        google_rating: 4.5,
        open_status: { state: "closed", opensAt: "08:00", opensDay: "sat", opensToday: false },
      }),
    ]);
    expect(ranked.map((candidate) => candidate.slug)).toEqual([
      "closed-local",
      "open-chain",
    ]);
  });

  it("returns the complete open brewery set for the Beer page filter", () => {
    const answer = buildWantAnswer(
      "breweries",
      null,
      null,
      new Date("2026-07-18T00:00:00Z"),
    );
    expect(answer?.open).toBeDefined();
    expect(answer?.open?.length).toBeGreaterThan(5);
    expect(new Set(answer?.open?.map((row) => row.slug)).size).toBe(answer?.open?.length);
  });
});

// ── approxHeroIndex — the coarse-origin hero rule ────────────────────
// An IP-seeded centroid may ORDER the list but must not CROWN the hero:
// among the nearest pool, the strongest place wins (the July 2026 Reddit
// review caught a chain nearest the IP centroid outranking downtown).
import { approxHeroIndex, type WantCandidate as WC } from "./want-answer";

const openAt = (slug: string, distance_m: number, feature_score: number): WC => ({
  slug,
  name: slug,
  open_status: { state: "open" } as WC["open_status"],
  distance_m,
  feature_score,
});

describe("approxHeroIndex", () => {
  it("crowns the strongest place in the near pool, not the fluke nearest", () => {
    const open = [
      openAt("chain-nearest-centroid", 400, 0.2),
      openAt("downtown-favorite", 2100, 0.9),
      openAt("solid-second", 2400, 0.7),
    ];
    expect(approxHeroIndex(open)).toBe(1);
  });

  it("keeps the nearest when it is also the strongest", () => {
    const open = [openAt("best-and-nearest", 300, 0.95), openAt("weaker", 900, 0.4)];
    expect(approxHeroIndex(open)).toBe(0);
  });

  it("only considers the plausibly-near pool (first 10)", () => {
    const open = [
      ...Array.from({ length: 10 }, (_, i) => openAt(`near-${i}`, 100 * (i + 1), 0.5)),
      openAt("far-side-of-county-superstar", 30000, 1),
    ];
    expect(approxHeroIndex(open)).toBeLessThan(10);
  });

  it("handles empty and single-item lists", () => {
    expect(approxHeroIndex([])).toBe(0);
    expect(approxHeroIndex([openAt("only", 100, 0.1)])).toBe(0);
  });
});
