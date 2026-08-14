import { mayRankByDecisionOrigin } from "@/lib/decision/core";
import type { DecisionOriginSource } from "@/lib/scope";

/**
 * The small, client-safe place shape needed by the shared nearby comparator.
 *
 * A nearby answer should prefer confirmed evidence among options in the same
 * area, then move outward predictably. Photos, review volume, and missing
 * hours are useful tie-breakers; they are not permission for a place in
 * another town to leapfrog a credible option around the corner.
 */
export type NearbyRankablePlace = {
  slug: string;
  name: string;
  confidence?: "curated" | "partner" | "verified" | "scraped";
  is_verified?: boolean;
  feature_score?: number;
  local_favorite?: boolean;
  field_notes?: boolean;
};

export type NearbyPlaceCandidate<T extends NearbyRankablePlace> = {
  place: T;
  distance: number;
  /** Intent-specific quality. It only settles a short-walk window when an
   * origin is trustworthy; without an origin, it remains the primary order. */
  quality?: number;
  /** Last deterministic fallback when a surface needs to preserve input order. */
  ordinal?: number;
};

/**
 * Two deliberately broad evidence bands.
 *
 * 1 - a credible place confirmed by an editorial, partner, or authoritative
 *     source.
 * 0 - an unreviewed/scraped row. It stays findable, but carries a bounded
 *     proximity penalty against confirmed alternatives.
 *
 * Local-favorite status, field notes, review counts, and photos are
 * intentionally absent. They can settle a close call through `quality`; they
 * are not permission to promote a place several miles away.
 */
export function nearbyPlaceEvidenceBand(
  place: NearbyRankablePlace,
): 0 | 1 {
  const credible = place.confidence
    ? place.confidence !== "scraped"
    : Boolean(place.is_verified);
  return credible ? 1 : 0;
}

/** Roughly one short city block. Quality may choose between places inside
 * the same window, but crossing a window restores strict proximity order. */
export const NEARBY_DISTANCE_WINDOW_M = 150;

/** An unreviewed coordinate carries a bounded trust penalty. It can lose to a
 * confirmed option within a reasonable walk, but it still stays ahead of a
 * confirmed result several miles away. */
export const NEARBY_UNREVIEWED_PENALTY_M = 1_000;

/**
 * A transitive, evidence-aware nearby order.
 *
 * The old nearby comparator mixed a pairwise 2.5 km override with a continuous
 * quality score. That can create a cycle (A beats B, B beats C, C beats A), so
 * JavaScript's sort is allowed to produce a visibly non-local result. Stable
 * bands avoid that: evidence-adjusted block-scale proximity, source evidence,
 * surface-specific quality for close calls, exact distance, and deterministic
 * text keys. The evidence adjustment is capped, so trust cannot import a
 * result from another part of the county.
 */
export function compareNearbyPlaceCandidates<T extends NearbyRankablePlace>(
  a: NearbyPlaceCandidate<T>,
  b: NearbyPlaceCandidate<T>,
  originSource: DecisionOriginSource,
): number {
  if (mayRankByDecisionOrigin(originSource)) {
    const aFinite = Number.isFinite(a.distance);
    const bFinite = Number.isFinite(b.distance);
    if (aFinite !== bFinite) return aFinite ? -1 : 1;
    if (aFinite && bFinite) {
      const adjustedDistance = (candidate: NearbyPlaceCandidate<T>) =>
        candidate.distance + (
          nearbyPlaceEvidenceBand(candidate.place) === 0
            ? NEARBY_UNREVIEWED_PENALTY_M
            : 0
        );
      const adjustedWindow =
        Math.floor(adjustedDistance(a) / NEARBY_DISTANCE_WINDOW_M) -
        Math.floor(adjustedDistance(b) / NEARBY_DISTANCE_WINDOW_M);
      if (adjustedWindow) return adjustedWindow;
    }
  }

  const evidence =
    nearbyPlaceEvidenceBand(b.place) - nearbyPlaceEvidenceBand(a.place);
  if (evidence) return evidence;

  if (mayRankByDecisionOrigin(originSource)) {
    if (Number.isFinite(a.distance) && Number.isFinite(b.distance)) {
      const distanceWindow =
        Math.floor(a.distance / NEARBY_DISTANCE_WINDOW_M) -
        Math.floor(b.distance / NEARBY_DISTANCE_WINDOW_M);
      if (distanceWindow) return distanceWindow;
    }
  }

  const quality = (b.quality ?? 0) - (a.quality ?? 0);
  if (quality) return quality;

  if (mayRankByDecisionOrigin(originSource)) {
    const distance = a.distance - b.distance;
    if (distance) return distance;
  }

  return (
    a.place.name.localeCompare(b.place.name, "en-US") ||
    a.place.slug.localeCompare(b.place.slug, "en-US") ||
    (a.ordinal ?? 0) - (b.ordinal ?? 0)
  );
}
