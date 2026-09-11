import { describe, expect, it } from "vitest";
import { betaOpenNowSnapshot } from "@/lib/loaders/betaPulse";
import {
  buildOpenNowSnapshot,
  countOpenNow,
  getOpenNowSnapshot,
  likelyOpenPlaces,
  openNowHighlights,
  publicPlaceBySlug,
} from "@/lib/loaders/places";
import type { PlaceCardData } from "@/lib/loaders/places";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

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

  it("uses a selected town as a hard boundary for confirmed-open inventory", () => {
    const town = "frederick";
    const origin = MUNICIPALITY_BY_SLUG[town]?.centroid;
    expect(origin).toBeDefined();

    const snapshot = getOpenNowSnapshot(NOW, origin, 0, {
      municipality: town,
      originSource: "town",
    });

    expect(snapshot.places.length).toBeGreaterThan(0);
    expect(snapshot.places.every((place) => place.municipality === town)).toBe(
      true,
    );
  });

  it("uses a saved home only to rank the county-wide inventory", () => {
    const town = "walkersville";
    const origin = MUNICIPALITY_BY_SLUG[town]?.centroid;
    expect(origin).toBeDefined();

    const county = getOpenNowSnapshot(NOW);
    const rankedFromHome = getOpenNowSnapshot(NOW, origin, 0, {
      originSource: "home",
    });

    expect(new Set(rankedFromHome.places.map((place) => place.slug))).toEqual(
      new Set(county.places.map((place) => place.slug)),
    );
    expect(
      rankedFromHome.places.some((place) => place.municipality !== town),
    ).toBe(true);
  });

  it("applies the same selected-town boundary to likely-open fallbacks", () => {
    const now = new Date("2027-01-06T17:00:00-05:00");
    const town = "frederick";
    const origin = MUNICIPALITY_BY_SLUG[town]?.centroid;
    expect(origin).toBeDefined();

    const county = likelyOpenPlaces(origin, now, { originSource: "town" });
    const scoped = likelyOpenPlaces(origin, now, {
      municipality: town,
      originSource: "town",
    });

    expect(county.length).toBeGreaterThan(0);
    expect(scoped).toEqual(
      county.filter((place) => place.municipality === town),
    );
    expect(scoped.every((place) => place.municipality === town)).toBe(true);
  });
});
