import { describe, it, expect } from "vitest";
import { gateRecommendable, tierRank } from "@/lib/guided/rank";
import type { PlaceCardData } from "@/lib/loaders/places";

// A high-quality, discoverable place (Tier 1) vs a non-discoverable B2B type
// the audit hides (Tier 4). We only need the fields recommendationTier reads.
const tier1 = (o: Partial<PlaceCardData> = {}): PlaceCardData =>
  ({
    slug: "good",
    name: "Gravel & Grind",
    category: "coffee",
    source: "google",
    google_rating: 4.7,
    google_rating_count: 320,
    google_photo_url: "https://example.com/p.jpg",
    geom: { lng: -77.41, lat: 39.41 },
    ...o,
  }) as PlaceCardData;

const tier4 = (o: Partial<PlaceCardData> = {}): PlaceCardData =>
  ({
    slug: "biz",
    name: "Closed Diner",
    category: "restaurant",
    source: "google",
    is_operational: "closed_permanently",
    geom: { lng: -77.41, lat: 39.41 },
    ...o,
  }) as PlaceCardData;

describe("guided/rank", () => {
  it("gateRecommendable drops Tier-4 places, keeps Tier 1–3", () => {
    const kept = gateRecommendable([tier1(), tier4()]);
    expect(kept.map((p) => p.slug)).toEqual(["good"]);
  });

  it("tierRank orders a recommendable pick ahead of a hidden type", () => {
    expect(tierRank(tier1())).toBeLessThan(tierRank(tier4()));
  });
});
