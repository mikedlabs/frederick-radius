import { describe, expect, it } from "vitest";
import { partitionWant, type WantCandidate } from "./want-answer";

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
