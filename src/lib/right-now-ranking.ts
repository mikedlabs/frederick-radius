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

/**
 * How strongly current hours should affect a nearby answer.
 *
 * `required` is reserved for intents where being open is essential and the
 * result set has enough current-hours coverage to support that claim.
 * `bonus` treats confirmed-open as useful evidence without allowing a distant
 * listing to jump a much closer place whose hours are simply unknown.
 * `not-applicable` does not reward open status (parks and similar
 * destinations), though a confirmed closure remains actionable.
 */
export type RightNowAvailabilityMode =
  | "required"
  | "bonus"
  | "not-applicable";

export type SmartNearbyContext = {
  hasOrigin: boolean;
  savedSlugs?: ReadonlySet<string>;
  visitedSlugs?: ReadonlySet<string>;
};

/**
 * A required-hours intent may only use the hard open-first tier when Radius
 * has enough decided statuses to support it. Sparse coverage downgrades hours
 * to a bonus instead of turning "unknown" into "closed."
 */
export function resolveRightNowAvailabilityMode(
  requested: RightNowAvailabilityMode,
  hasSufficientHoursCoverage: boolean,
): RightNowAvailabilityMode {
  if (requested === "required" && !hasSufficientHoursCoverage) return "bonus";
  return requested;
}

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
  availabilityMode: RightNowAvailabilityMode = "required",
): number {
  if (availabilityMode === "required") {
    // Food and other truly time-sensitive intents keep the familiar open-first
    // tier, but only after the caller has verified sufficient hours coverage.
    if (a.open !== b.open) return a.open ? -1 : 1;
  } else {
    // A known closure is actionable evidence and belongs after usable choices.
    // Unknown hours are not a closure and must stay eligible.
    const aClosed = !a.open && a.p.open_status?.state === "closed";
    const bClosed = !b.open && b.p.open_status?.state === "closed";
    if (aClosed !== bClosed) return aClosed ? 1 : -1;

    // With a deliberate origin, a large distance difference is decisive. This
    // is the guardrail that prevents a confirmed-open place eleven miles away
    // from beating an otherwise suitable place around the corner just because
    // the local listing has not had its hours verified.
    if (
      hasOrigin &&
      Number.isFinite(a.dist) &&
      Number.isFinite(b.dist) &&
      Math.abs(a.dist - b.dist) >= 2_500
    ) {
      return a.dist - b.dist;
    }
  }

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
    // In flexible mode, verified-open is a quiet nudge, not a gate. The bonus
    // is deliberately smaller than the proximity guardrail above.
    const openBonus = availabilityMode === "bonus" ? 0.07 : 0;
    const aScore = smartNearbyScore(a, context) + (a.open ? openBonus : 0);
    const bScore = smartNearbyScore(b, context) + (b.open ? openBonus : 0);
    const smart = bScore - aScore;
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
  if (
    availabilityMode === "bonus" &&
    a.open !== b.open
  ) {
    return a.open ? -1 : 1;
  }
  return a.p.name.localeCompare(b.p.name);
}

/** Describe the actual ordering shown in Nearby. The caller says whether this
 * result set has an honest hard availability tier. */
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
