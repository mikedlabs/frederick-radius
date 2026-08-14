import type { PlaceCardData } from "@/lib/loaders/places";
import type { DecisionOriginSource } from "@/lib/scope";
import { ratingSignal } from "@/lib/category-ranking";
import { placeQuality } from "@/lib/quality/placeQuality";
import {
  evaluateDecision,
  mayRankByDecisionOrigin,
  resolveDecisionAvailabilityPolicy,
  type DecisionAvailabilityMode,
  type DecisionReason,
} from "@/lib/decision/core";
import {
  compareNearbyPlaceCandidates,
  nearbyPlaceEvidenceBand,
} from "@/lib/decision/nearby-place-ranking";

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
export type RightNowAvailabilityMode = DecisionAvailabilityMode;

export type SmartNearbyContext = {
  hasOrigin: boolean;
  savedSlugs?: ReadonlySet<string>;
  visitedSlugs?: ReadonlySet<string>;
};

function smartNearbyFactors(
  candidate: RightNowCandidate,
  context: SmartNearbyContext,
) {
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
  return [
    {
      id: "quality",
      label: "It has stronger listing evidence.",
      points: rightNowQualityScore(p) * 0.4,
      visible: false,
    },
    {
      id: "proximity",
      label: "It is close to your location.",
      points: proximityScore(dist, context.hasOrigin) * 0.3,
      visible: context.hasOrigin,
      evidenceIds: context.hasOrigin ? ["decision-origin"] : [],
    },
    {
      id: "trust",
      label: "Its listing has current verified details.",
      points: trust * 0.16,
      visible: trust > 0,
      evidenceIds: trust > 0 ? ["place-record"] : [],
    },
    {
      id: "local-knowledge",
      label: "Radius has useful local detail about this place.",
      points: localKnowledge * 0.14,
      visible: localKnowledge > 0,
      evidenceIds: localKnowledge > 0 ? ["radius-field-guide"] : [],
    },
    {
      id: "personal",
      label: "You saved this place.",
      points: personal,
      visible: saved > 0,
      evidenceIds: saved > 0 ? ["saved-place"] : [],
    },
  ];
}

/**
 * A required-hours intent may only use the hard open-first tier when Radius
 * has enough decided statuses to support it. Sparse coverage downgrades hours
 * to a bonus instead of turning "unknown" into "closed."
 */
export function resolveRightNowAvailabilityMode(
  requested: RightNowAvailabilityMode,
  hasSufficientHoursCoverage: boolean,
): RightNowAvailabilityMode {
  const policy = resolveDecisionAvailabilityPolicy({
    requested,
    hasSufficientCoverage: hasSufficientHoursCoverage,
    thinCoverageBehavior: "nudge",
  });
  return policy.ordering === "open-nudge" && requested === "required"
    ? "bonus"
    : requested;
}

/** Device, chosen-town, and saved-home origins reflect user intent. A coarse
 * IP centroid is only regional context and must not drive nearest-first. */
export function canUseOriginForRanking(source: DecisionOriginSource): boolean {
  return mayRankByDecisionOrigin(source);
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
  return evaluateDecision(candidate, smartNearbyFactors(candidate, context)).score;
}

/** The same factors used for Smart Nearby, without exposing their weights. */
export function rightNowDecisionReasons(
  candidate: RightNowCandidate,
  context: SmartNearbyContext,
): DecisionReason[] {
  return evaluateDecision(
    candidate,
    smartNearbyFactors(candidate, context),
  ).reasons;
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

  }

  // “Nearest” is an explicit user-selected sort, so it must mean literal
  // distance inside the availability tier. The shared nearby comparator lets
  // quality settle a block-scale close call; using it here made a richer place
  // 149 m away appear before one 1 m away while the UI still said “nearest
  // first.” Trust remains visible on the cards and governs Smart ranking, but
  // it must not silently redefine this manual control.
  if (sort === "nearest" && hasOrigin) {
    const aFinite = Number.isFinite(a.dist);
    const bFinite = Number.isFinite(b.dist);
    if (aFinite !== bFinite) return aFinite ? -1 : 1;
    const distance = a.dist - b.dist;
    if (distance) return distance;
    return a.p.name.localeCompare(b.p.name, "en-US") ||
      a.p.slug.localeCompare(b.p.slug, "en-US");
  }

  if (sort === "rated") {
    // Trust is still a prerequisite for a promoted result. A high star value
    // on an unreviewed row cannot make it the lead over confirmed places.
    const evidence =
      nearbyPlaceEvidenceBand(b.p) - nearbyPlaceEvidenceBand(a.p);
    if (evidence) return evidence;
    const aHasReviews = Number.isFinite(a.p.google_rating) && (a.p.google_rating_count ?? 0) > 0;
    const bHasReviews = Number.isFinite(b.p.google_rating) && (b.p.google_rating_count ?? 0) > 0;
    if (aHasReviews !== bHasReviews) return aHasReviews ? -1 : 1;
    const rating = ratingSignal(b.p.google_rating, b.p.google_rating_count) -
      ratingSignal(a.p.google_rating, a.p.google_rating_count);
    if (rating) return rating;
    const count = (b.p.google_rating_count ?? 0) - (a.p.google_rating_count ?? 0);
    if (count) return count;
  }

  const context = { hasOrigin, ...personal };
  // Flexible-hours evidence and Smart Nearby's richer signals remain useful
  // after the trust/distance contract. They cannot make a farther credible
  // place leapfrog a closer credible one; without a trustworthy origin they
  // remain the primary quality order.
  const openBonus = availabilityMode === "bonus" ? 0.07 : 0;
  const quality = (candidate: RightNowCandidate) =>
    (sort === "smart"
      ? smartNearbyScore(candidate, context)
      : rightNowQualityScore(candidate.p)) +
    (candidate.open ? openBonus : 0);

  return compareNearbyPlaceCandidates(
    {
      place: a.p,
      distance: a.dist,
      quality: quality(a),
    },
    {
      place: b.p,
      distance: b.dist,
      quality: quality(b),
    },
    hasOrigin ? "device" : "none",
  );
}

/** Describe the actual ordering shown in Nearby. The caller says whether this
 * result set has an honest hard availability tier. */
export function rightNowSortLabel(
  sort: RightNowSort,
  hasOrigin: boolean,
  availabilityLead: "open" | "available" | null,
): string {
  const label = (orderedBy: string) =>
    availabilityLead
      ? `${availabilityLead} first, then ${orderedBy}`
      : `${orderedBy} first`;
  if (sort === "smart") {
    return label("best fit");
  }
  if (sort === "rated") {
    return label("top rated");
  }
  if (hasOrigin) {
    return label("nearest");
  }
  return availabilityLead
    ? `${availabilityLead} first, then best matches`
    : "best matches";
}
