import { describe, it, expect } from "vitest";
import { selectCuratedStack } from "@/lib/category-ranking";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * PR5 — progressive dedupe of the category page's curated stack. A place
 * that's open AND loved AND nearby used to appear in all four sections
 * (Best / Open now / Local favorites / Nearby). It must now appear ONCE, in
 * the earliest section it qualifies for, with later sections degrading
 * gracefully rather than back-filling a place already shown above.
 */
const place = (slug: string, o: Partial<PlaceCardData> = {}): PlaceCardData =>
  ({
    slug,
    name: slug,
    category: "coffee",
    municipality: "frederick",
    feature_score: 5,
    distance_m: 1000,
    local_favorite: false,
    open_status: { state: "closed" },
    google_rating: 4.2,
    google_rating_count: 50,
    is_verified: false,
    ...o,
  }) as unknown as PlaceCardData;

const slugsOf = (ps: PlaceCardData[]) => ps.map((p) => p.slug);
const allShown = (s: ReturnType<typeof selectCuratedStack>) =>
  [...s.best, ...s.openNow, ...s.favs, ...s.nearby].map((p) => p.slug);

describe("selectCuratedStack — progressive dedupe", () => {
  it("a place qualifying for Best, Open now, Local favorite, AND Nearby appears once — in Best only", () => {
    // "super" dominates score (best), and is also open + favorite + nearest.
    const rec: PlaceCardData[] = [
      place("super", {
        feature_score: 10,
        local_favorite: true,
        open_status: { state: "open" } as PlaceCardData["open_status"],
        distance_m: 1,
        google_rating: 4.9,
        google_rating_count: 800,
      }),
      // filler so the other sections have their own distinct content
      place("open-a", { open_status: { state: "open" } as PlaceCardData["open_status"], distance_m: 500 }),
      place("open-b", { open_status: { state: "open" } as PlaceCardData["open_status"], distance_m: 700 }),
      place("fav-a", { local_favorite: true, feature_score: 6 }),
      place("fav-b", { local_favorite: true, feature_score: 6 }),
      place("near-a", { distance_m: 50 }),
      place("near-b", { distance_m: 80 }),
    ];
    const s = selectCuratedStack(rec, { town: "frederick" });

    expect(slugsOf(s.best)).toContain("super");
    expect(slugsOf(s.openNow)).not.toContain("super");
    expect(slugsOf(s.favs)).not.toContain("super");
    expect(slugsOf(s.nearby)).not.toContain("super");
  });

  it("no place appears in more than one curated section (the core invariant)", () => {
    const rec: PlaceCardData[] = Array.from({ length: 12 }, (_, i) =>
      place(`p${i}`, {
        feature_score: 10 - i * 0.1,
        local_favorite: i % 2 === 0,
        open_status: { state: i % 3 === 0 ? "open" : "closed" } as PlaceCardData["open_status"],
        distance_m: i * 100,
      }),
    );
    const flat = allShown(selectCuratedStack(rec, { town: "frederick" }));
    expect(flat.length).toBe(new Set(flat).size);
  });

  it("degrades gracefully: a later section goes empty rather than back-filling a shown place", () => {
    // Only 3 places, all open + favorite + near. Best takes all 3; nothing
    // is left for Open now / Local favorites / Nearby.
    const rec: PlaceCardData[] = ["a", "b", "c"].map((s, i) =>
      place(s, {
        feature_score: 9 - i,
        local_favorite: true,
        open_status: { state: "open" } as PlaceCardData["open_status"],
        distance_m: i + 1,
      }),
    );
    const s = selectCuratedStack(rec, { town: "frederick" });
    expect(s.best).toHaveLength(3);
    expect(s.openNow).toHaveLength(0);
    expect(s.favs).toHaveLength(0);
    expect(s.nearby).toHaveLength(0);
    // and nothing duplicated
    const flat = allShown(s);
    expect(flat.length).toBe(new Set(flat).size);
  });

  it("respects section caps (bestN=3, sectionN=6 by default)", () => {
    const rec: PlaceCardData[] = Array.from({ length: 40 }, (_, i) =>
      place(`q${i}`, {
        open_status: { state: "open" } as PlaceCardData["open_status"],
        distance_m: i,
      }),
    );
    const s = selectCuratedStack(rec, {});
    expect(s.best.length).toBeLessThanOrEqual(3);
    expect(s.openNow.length).toBeLessThanOrEqual(6);
    expect(s.favs.length).toBeLessThanOrEqual(6);
    expect(s.nearby.length).toBeLessThanOrEqual(6);
  });
});
