import type { PlaceCardData } from "@/lib/loaders/places";
import type { DecisionOriginSource } from "@/lib/scope";
import { ratingSignal } from "@/lib/category-ranking";
import { placeQuality } from "@/lib/quality/placeQuality";

export type RightNowCandidate = {
  p: PlaceCardData;
  dist: number;
  open: boolean;
};

export type RightNowSort = "smart" | "nearest" | "rated";

export type SmartNearbyContext = {
  hasOrigin: boolean;
  savedSlugs?: ReadonlySet<string>;
  visitedSlugs?: ReadonlySet<string>;
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

function proximityScore(distance: number, hasOrigin: boolean): number {
  if (!hasOrigin || !Number.isFinite(distance)) return 0.5;
  return 1 / (1 + distance / 2_500);
}

/**
 * Explainable Smart Nearby score. Every term comes from a fact Radius already
 * holds: useful listing quality, trustworthy distance, verified data, local
 * field notes, and the visitor's device-local saves/visits. Personal signals
 * are soft nudges; they never override the open/closed tier in the comparator.
 */
export function smartNearbyScore(
  candidate: RightNowCandidate,
  context: SmartNearbyContext,
): number {
  const { p, dist } = candidate;
  const trust =
    (p.open_confidence === "verified" ? 0.55 : 0) +
    (p.is_verified || p.hours_verified ? 0.45 : 0);
  const localKnowledge =
    (p.field_notes ? 0.6 : 0) +
    ((p.known_for?.length ?? 0) > 0 || Boolean(p.short_blurb) ? 0.4 : 0);
  const saved = context.savedSlugs?.has(p.slug) ? 1 : 0;
  const visited = context.visitedSlugs?.has(p.slug) ? 1 : 0;
  const personal = saved * 0.08 - (visited && !saved ? 0.04 : 0);

  return (
    rightNowQualityScore(p) * 0.4 +
    proximityScore(dist, context.hasOrigin) * 0.3 +
    trust * 0.16 +
    localKnowledge * 0.14 +
    personal
  );
}

export function compareRightNowCandidates(
  a: RightNowCandidate,
  b: RightNowCandidate,
  sort: RightNowSort,
  hasOrigin: boolean,
  personal: Omit<SmartNearbyContext, "hasOrigin"> = {},
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

  if (sort === "smart") {
    const context = { hasOrigin, ...personal };
    const smart = smartNearbyScore(b, context) - smartNearbyScore(a, context);
    if (smart) return smart;
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

/** Describe the actual ordering shown in Nearby. Availability is a hard tier
 * unless the user has already narrowed the list to Open now. */
export function rightNowSortLabel(
  sort: RightNowSort,
  hasOrigin: boolean,
  availabilityLeads: boolean,
): string {
  if (sort === "smart") {
    return availabilityLeads ? "open first, then best fit" : "best fit first";
  }
  if (sort === "rated") {
    return availabilityLeads ? "open first, then top rated" : "top rated first";
  }
  if (hasOrigin) {
    return availabilityLeads ? "open first, then nearest" : "nearest first";
  }
  return availabilityLeads ? "open first, then best matches" : "best matches";
}
