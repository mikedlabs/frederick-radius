import { describe, expect, it } from "vitest";
import { betaOpenNowSnapshot } from "@/lib/loaders/betaPulse";
import {
  buildOpenNowSnapshot,
  countOpenNow,
  getOpenNowSnapshot,
  openNowHighlights,
  publicPlaceBySlug,
} from "@/lib/loaders/places";
import type { PlaceCardData } from "@/lib/loaders/places";

const NOW = new Date("2026-07-29T14:00:00-04:00");

function openCandidate(
  slug: string,
  name: string,
  category: string,
  primaryType?: string,
): PlaceCardData {
  return {
    slug,
    name,
    category,
    primary_type: primaryType,
    source: "manual",
    feature_score: 5,
    open_status: {
      state: "open",
      closesAt: "18:00",
      closingSoon: false,
    },
  } as PlaceCardData;
}

const NON_LEISURE = [
  openCandidate("odin-crossfit", "Odin CrossFit", "wellness", "gym"),
  openCandidate("artistangle-gallery", "ArtistAngle Gallery", "shopping", "store"),
  openCandidate("ppr-strategies", "PPR Strategies", "services", "consultant"),
];

const LEISURE = [
  openCandidate("test-kitchen", "Test Kitchen", "restaurant"),
  openCandidate("test-museum", "Test Museum", "museum"),
  openCandidate("test-market", "Test Market", "market"),
];

describe("county open-now snapshot", () => {
  it("drives every county count from one untruncated population and instant", () => {
    const snapshot = getOpenNowSnapshot(NOW);
    const beta = betaOpenNowSnapshot(NOW);
    const compatibility = openNowHighlights(3, NOW);

    expect(snapshot.count).toBe(snapshot.places.length);
    expect(countOpenNow(NOW)).toBe(snapshot.count);
    expect(compatibility.count).toBe(snapshot.count);
    expect(beta.inventoryCount).toBe(snapshot.count);
    expect(snapshot.asOf).toBe(NOW.toISOString());
    expect(compatibility.asOf).toBe(snapshot.asOf);
    expect(beta.asOf).toBe(snapshot.asOf);
  });

  it("keeps non-leisure inventory searchable without promoting it as a pick", () => {
    for (const { slug } of NON_LEISURE) {
      expect(
        publicPlaceBySlug(slug),
        `${slug} should remain in the public searchable catalog`,
      ).toBeDefined();
    }

    const snapshot = buildOpenNowSnapshot(
      [...NON_LEISURE, ...LEISURE],
      NOW,
    );
    const inventorySlugs = new Set(snapshot.places.map(({ slug }) => slug));
    const proofSlugs = new Set(
      snapshot.worthConsidering.map(({ slug }) => slug),
    );

    for (const { slug } of NON_LEISURE) {
      expect(inventorySlugs.has(slug), `${slug} should remain in inventory`).toBe(
        true,
      );
      expect(proofSlugs.has(slug), `${slug} must not become beta proof`).toBe(
        false,
      );
    }
  });

  it("selects a stable, module-diverse proof instead of three directory rows", () => {
    const first = buildOpenNowSnapshot(LEISURE, NOW).worthConsidering;
    const second = buildOpenNowSnapshot(LEISURE, NOW).worthConsidering;

    expect(second).toEqual(first);
    expect(first).toHaveLength(3);
    expect(new Set(first.map(({ module }) => module)).size).toBe(3);
  });
});
