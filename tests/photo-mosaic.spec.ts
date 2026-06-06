import { describe, it, expect } from "vitest";
import { pickPhotos } from "@/components/today/PhotoMosaic";
import { PHOTOGENIC_CATEGORIES } from "@/lib/photogenic";
import type { PlaceCardData } from "@/lib/loaders/places";

const CAT = [...PHOTOGENIC_CATEGORIES][0];
const place = (slug: string): PlaceCardData =>
  ({ slug, name: slug, google_photo_url: `https://blob/${slug}.jpg`, category: CAT }) as unknown as PlaceCardData;

const uniqueSlugs = (tiles: PlaceCardData[]) => new Set(tiles.map((t) => t.slug)).size;

describe("PhotoMosaic pickPhotos — never repeats a place (the Spinners ×6 fix)", () => {
  it("a single-place pool yields ONE tile, not six copies", () => {
    const tiles = pickPhotos(6, 0, [place("spinners")]);
    expect(tiles.length).toBe(1);
    expect(uniqueSlugs(tiles)).toBe(1);
  });

  it("a 3-place pool yields 3 distinct tiles when 6 are requested", () => {
    const pool = ["a", "b", "c"].map(place);
    const tiles = pickPhotos(6, 0, pool);
    expect(tiles.length).toBe(3);
    expect(uniqueSlugs(tiles)).toBe(3);
  });

  it("a large pool yields exactly `count` distinct tiles", () => {
    const pool = Array.from({ length: 10 }, (_, i) => place(`p${i}`));
    const tiles = pickPhotos(6, 0, pool);
    expect(tiles.length).toBe(6);
    expect(uniqueSlugs(tiles)).toBe(6);
  });

  it("rotates by day (different start) but stays all-distinct", () => {
    const pool = Array.from({ length: 10 }, (_, i) => place(`p${i}`));
    const day0 = pickPhotos(3, 0, pool).map((t) => t.slug);
    const day5 = pickPhotos(3, 5, pool).map((t) => t.slug);
    expect(day0).not.toEqual(day5);
    expect(uniqueSlugs(pickPhotos(3, 5, pool))).toBe(3);
  });

  it("empty pool → no tiles", () => {
    expect(pickPhotos(6, 0, [])).toEqual([]);
  });
});
