import type { PlaceCardData } from "@/lib/loaders/places";
import type { DecisionOriginSource } from "@/lib/scope";
import { ratingSignal } from "@/lib/category-ranking";
import { placeQuality } from "@/lib/quality/placeQuality";

export type RightNowCandidate = {
  p: PlaceCardData;
  dist: number;
  open: boolean;
};

/** Device, chosen-town, and saved-home origins reflect user intent. A coarse
 * IP centroid is only regional context and must not drive nearest-first. */
export function canUseOriginForRanking(source: DecisionOriginSource): boolean {
  return source === "device" || source === "town" || source === "home";
}

/** A client-safe, evidence-backed fallback for when no origin is available. */
export function rightNowQualityScore(place: PlaceCardData): number {
  const feature = Math.max(0, Math.min(1, (place.feature_score ?? 0) / 10));
  const evidence = Math.max(0, Math.min(1, placeQuality(place) / 0.9));
  const favorite = place.local_favorite ? 1 : 0;
  return (
    ratingSignal(place.google_rating, place.google_rating_count) * 0.35 +
    feature * 0.3 +
    evidence * 0.25 +
    favorite * 0.1
  );
}

export function compareRightNowCandidates(
  a: RightNowCandidate,
  b: RightNowCandidate,
  sort: "nearest" | "rated",
  hasOrigin: boolean,
): number {
  // Availability is a hard tier. Quality and distance may reorder within a
  // tier, never turn a closed/unknown listing into the lead over an open one.
  if (a.open !== b.open) return a.open ? -1 : 1;

  if (sort === "rated") {
    const aHasReviews = Number.isFinite(a.p.google_rating) && (a.p.google_rating_count ?? 0) > 0;
    const bHasReviews = Number.isFinite(b.p.google_rating) && (b.p.google_rating_count ?? 0) > 0;
    if (aHasReviews !== bHasReviews) return aHasReviews ? -1 : 1;
    const rating = ratingSignal(b.p.google_rating, b.p.google_rating_count) -
      ratingSignal(a.p.google_rating, a.p.google_rating_count);
    if (rating) return rating;
    const count = (b.p.google_rating_count ?? 0) - (a.p.google_rating_count ?? 0);
    if (count) return count;
  }

  if (sort === "nearest" && hasOrigin) {
    const distance = a.dist - b.dist;
    if (distance) return distance;
  }

  const quality = rightNowQualityScore(b.p) - rightNowQualityScore(a.p);
  if (quality) return quality;

  if (hasOrigin) {
    const distance = a.dist - b.dist;
    if (distance) return distance;
  }
  return a.p.name.localeCompare(b.p.name);
}
