import { describe, it, expect } from "vitest";
import { rotatePickDistinct } from "./worth-a-look";

const pool = (n: number) => Array.from({ length: n }, (_, i) => ({ slug: `p${i}` }));

describe("rotatePickDistinct", () => {
  it("never returns a duplicate slug, even when stride shares a factor with pool length", () => {
    // stride 7 on a pool of 14 is the exact collision that duplicated a rail
    // tile: {0,7,14%14=0,...} revisits index 0.
    for (const len of [7, 14, 21, 28, 35]) {
      const picks = rotatePickDistinct(pool(len), 3, 6, 7);
      const slugs = picks.map((p) => p.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("returns `count` distinct items when the pool is large enough", () => {
    const picks = rotatePickDistinct(pool(60), 10, 6, 7);
    expect(picks).toHaveLength(6);
    expect(new Set(picks.map((p) => p.slug)).size).toBe(6);
  });

  it("returns the whole pool (deduped) when it is smaller than count", () => {
    const picks = rotatePickDistinct(pool(4), 0, 6, 7);
    expect(picks).toHaveLength(4);
    expect(new Set(picks.map((p) => p.slug)).size).toBe(4);
  });

  it("is empty for an empty pool", () => {
    expect(rotatePickDistinct([], 0, 6, 7)).toEqual([]);
  });
});
