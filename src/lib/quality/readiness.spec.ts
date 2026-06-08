import { describe, it, expect } from "vitest";
import { recommendationTier, isTopRecommendable } from "@/lib/quality/readiness";
import type { PlaceCardData } from "@/lib/loaders/places";

// A minimally-valid Tier-eligible base: real name/category/coords, operational,
// a discoverable type, a non-dfp source (so isRecommendable passes by default).
const base = (o: Partial<PlaceCardData> = {}): PlaceCardData =>
  ({
    slug: "test-place",
    name: "Test Place",
    category: "coffee",
    geom: { lng: -77.41, lat: 39.41 },
    source: "manual",
    is_operational: "operational",
    ...o,
  }) as PlaceCardData;

const tier = (o: Partial<PlaceCardData> = {}) => recommendationTier(base(o)).tier;

describe("recommendationTier", () => {
  it("Tier 4 — hides a permanently-closed place", () => {
    expect(tier({ is_operational: "closed_permanently" })).toBe(4);
  });

  it("Tier 4 — hides a record missing coordinates", () => {
    const noCoords = { ...base(), geom: undefined } as unknown as PlaceCardData;
    expect(recommendationTier(noCoords).tier).toBe(4);
  });

  it("Tier 3 — flags a temporarily-closed place for review (never hidden)", () => {
    expect(tier({ is_operational: "closed_temporarily" })).toBe(3);
  });

  it("Tier 3 — flags a thin bare import with nothing real to show", () => {
    // dfp source + nothing else → low completeness, low quality.
    expect(tier({ source: "dfp", short_blurb: undefined })).toBe(3);
  });

  it("Tier 1 — a curated local favorite leads even with no Google profile", () => {
    expect(tier({ local_favorite: true })).toBe(1);
    expect(isTopRecommendable(base({ local_favorite: true }))).toBe(true);
  });

  it("Tier 1 — a confident, documented place leads", () => {
    expect(
      tier({
        google_photo_url: "x.jpg",
        google_rating: 4.6,
        google_rating_count: 200,
        open_confidence: "verified",
        short_blurb: "A real coffee shop downtown.",
      }),
    ).toBe(1);
  });

  it("Tier 2 — a real but unremarkable place is browse-only, not a top pick", () => {
    // Passes gates + completeness, but quality below the Tier-1 floor.
    const t = tier({ short_blurb: "Open for business.", address: "1 Market St" });
    expect(t).toBe(2);
    expect(isTopRecommendable(base({ short_blurb: "x", address: "1 Market St" }))).toBe(false);
  });

  it("tiers are mutually exclusive and total (always 1–4)", () => {
    const cases: Partial<PlaceCardData>[] = [
      {},
      { local_favorite: true },
      { is_operational: "closed_permanently" },
      { source: "dfp" },
    ];
    for (const o of cases) {
      expect([1, 2, 3, 4]).toContain(tier(o));
    }
  });
});
