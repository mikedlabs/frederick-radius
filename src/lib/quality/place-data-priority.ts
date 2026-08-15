import type { PlaceCardData } from "@/lib/loaders/places";
import { parseGoogleHours } from "@/lib/googleHours";
import { isHoursFresh } from "@/lib/hours-freshness";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";
import {
  publishableGooglePhotoNames,
} from "@/lib/google-photo-policy";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import { isGooglePlaceId } from "@/lib/provenance";
import {
  decisionCopyCounts,
  hasPublishedFreshHours,
  hasUsefulDecisionCopy,
  hasUsefulPhoto,
} from "@/lib/quality/coverage";
import {
  isDestinationCategory,
  isRecommendable,
} from "@/lib/relevance";

export type PlaceDataGapDimension = "copy" | "hours" | "photo";

export type PlaceDataGapReason =
  | "approve_source_backed_copy"
  | "collect_first_party_copy"
  | "replace_rejected_copy"
  | "investigate_copy_publication"
  | "refresh_hours"
  | "collect_official_hours"
  | "repair_hours_identity"
  | "provider_has_no_schedule"
  | "review_hours_format"
  | "verify_public_visitability"
  | "review_manual_hours_override"
  | "investigate_hours_publication"
  | "respect_photo_suppression"
  | "respect_manual_photo_clear"
  | "resolve_photo_identity"
  | "repair_photo_identity"
  | "refresh_photo_metadata"
  | "backfill_photo_attribution"
  | "investigate_photo_publication";

export type PlaceDataPriorityPlace = Pick<
  PlaceCardData,
  | "slug"
  | "name"
  | "category"
  | "source"
  | "primary_type"
  | "local_favorite"
  | "feature_score"
  | "google_rating"
  | "google_rating_count"
>;

export type PlaceDataCoveragePlace = PlaceDataPriorityPlace & Pick<
  PlaceCardData,
  | "google_place_id"
  | "hours"
  | "hours_verified"
  | "hours_updated_at"
  | "hero_image"
  | "google_photo_url"
  | "short_blurb"
>;

export type PlaceDataGapRow<T extends PlaceDataCoveragePlace> = {
  place: T;
  gaps: PlaceDataGapDimension[];
  reasons: Partial<Record<PlaceDataGapDimension, PlaceDataGapReason>>;
  priorityLabel: string;
};

type DescriptionEvidence = {
  status?: "candidate" | "approved" | "rejected";
};

type HoursRefreshEvidence = {
  place_id?: string;
  weekday_hours?: string[];
  refreshed_at?: string;
};

type PhotoEnrichmentEvidence = {
  google_place_id?: string;
  photo_names?: string[];
  photo_attributions?: GooglePhotoAttribution[];
};

export type PlaceDataGapEvidence = {
  descriptions?: Readonly<Record<string, DescriptionEvidence | undefined>>;
  hoursRefresh?: Readonly<Record<string, HoursRefreshEvidence | undefined>>;
  photoEnrichment?: Readonly<
    Record<string, PhotoEnrichmentEvidence | undefined>
  >;
  photoSuppressedSlugs?: ReadonlySet<string>;
  photoClearedSlugs?: ReadonlySet<string>;
  manualHoursSlugs?: ReadonlySet<string>;
};

export type PlaceDataPriorityOptions = {
  /** Optional operator override for a bounded campaign such as breweries. */
  preferredSlugs?: ReadonlySet<string>;
};

function flag(value: boolean): number {
  return value ? 1 : 0;
}

function isRecommendationEligible(place: PlaceDataPriorityPlace): boolean {
  return isRecommendable(place);
}

const REVIEW_EVIDENCE_PRIOR_RATING = 3;
const REVIEW_EVIDENCE_PRIOR_COUNT = 40;

/**
 * Conservative Bayesian estimate for an aggregate 1–5 star rating.
 *
 * A perfect score from one person is not stronger operating evidence than a
 * slightly lower score from hundreds of people. Shrinking toward the neutral
 * midpoint by 40 pseudo-reviews matches the catalog's existing threshold for
 * treating review volume as a meaningful local signal, while still allowing
 * rating quality to separate places once both have substantial evidence.
 */
function reviewEvidenceScore(place: PlaceDataPriorityPlace): number {
  const rawRating = place.google_rating;
  const reviewCount = Math.max(0, place.google_rating_count ?? 0);
  if (
    rawRating == null ||
    !Number.isFinite(rawRating) ||
    reviewCount <= 0
  ) {
    return 0;
  }
  const rating = Math.min(5, Math.max(1, rawRating));
  return (
    rating * reviewCount +
    REVIEW_EVIDENCE_PRIOR_RATING * REVIEW_EVIDENCE_PRIOR_COUNT
  ) / (reviewCount + REVIEW_EVIDENCE_PRIOR_COUNT);
}

/**
 * Deterministic operator ordering for place-data work.
 *
 * This is deliberately a catalog-ranking proxy, not an analytics claim.
 * Places eligible to lead discovery come first, followed by destination
 * categories, local favorites, curation score, and review evidence. A stable
 * name/slug tie-break keeps generated review queues diffable.
 */
export function comparePlaceDataPriority<T extends PlaceDataPriorityPlace>(
  a: T,
  b: T,
  options: PlaceDataPriorityOptions = {},
): number {
  const preferred = options.preferredSlugs;
  return (
    flag(Boolean(preferred?.has(b.slug))) -
      flag(Boolean(preferred?.has(a.slug))) ||
    flag(isRecommendationEligible(b)) - flag(isRecommendationEligible(a)) ||
    flag(isDestinationCategory(b.category)) -
      flag(isDestinationCategory(a.category)) ||
    flag(Boolean(b.local_favorite)) - flag(Boolean(a.local_favorite)) ||
    (b.feature_score ?? 0) - (a.feature_score ?? 0) ||
    reviewEvidenceScore(b) - reviewEvidenceScore(a) ||
    (b.google_rating_count ?? 0) - (a.google_rating_count ?? 0) ||
    (b.google_rating ?? 0) - (a.google_rating ?? 0) ||
    a.name.localeCompare(b.name, "en-US") ||
    a.slug.localeCompare(b.slug, "en-US")
  );
}

export function placeDataPriorityLabel(
  place: PlaceDataPriorityPlace,
): string {
  if (!isRecommendationEligible(place)) return "Browse-only record";
  const destination = isDestinationCategory(place.category);
  if (destination && place.local_favorite) {
    return "Local-favorite destination";
  }
  if (destination) return "Destination";
  if (place.local_favorite) return "Local favorite";
  return "Catalog record";
}

function copyGapReason(
  place: PlaceDataCoveragePlace,
  evidence: PlaceDataGapEvidence,
): PlaceDataGapReason {
  const status = evidence.descriptions?.[place.slug]?.status;
  if (status === "candidate") return "approve_source_backed_copy";
  if (status === "rejected") return "replace_rejected_copy";
  if (status === "approved") return "investigate_copy_publication";
  return "collect_first_party_copy";
}

function hoursGapReason(
  place: PlaceDataCoveragePlace,
  evidence: PlaceDataGapEvidence,
  now: Date,
): PlaceDataGapReason {
  if (evidence.manualHoursSlugs?.has(place.slug)) {
    return "review_manual_hours_override";
  }
  const refresh = evidence.hoursRefresh?.[place.slug];
  if (isGooglePlaceId(place.google_place_id)) {
    if (!refresh) return "refresh_hours";
    if (refresh.place_id !== place.google_place_id) {
      return "repair_hours_identity";
    }
    if (!isHoursFresh(refresh.refreshed_at, now)) return "refresh_hours";
    if (!refresh.weekday_hours?.length) return "provider_has_no_schedule";

    const parsed = parseGoogleHours(refresh.weekday_hours);
    if (!parsed) return "review_hours_format";
    if (!mayPublishVisitabilityHours(place.slug, parsed, now)) {
      return "verify_public_visitability";
    }
    return "investigate_hours_publication";
  }

  return "collect_official_hours";
}

function photoGapReason(
  place: PlaceDataCoveragePlace,
  evidence: PlaceDataGapEvidence,
): PlaceDataGapReason {
  if (evidence.photoClearedSlugs?.has(place.slug)) {
    return "respect_manual_photo_clear";
  }
  if (evidence.photoSuppressedSlugs?.has(place.slug)) {
    return "respect_photo_suppression";
  }
  if (!isGooglePlaceId(place.google_place_id)) {
    return "resolve_photo_identity";
  }

  const enrichment = evidence.photoEnrichment?.[place.slug];
  if (
    enrichment?.google_place_id &&
    enrichment.google_place_id !== place.google_place_id
  ) {
    return "repair_photo_identity";
  }
  if (!enrichment?.photo_names?.length) return "refresh_photo_metadata";
  if (
    publishableGooglePhotoNames(
      enrichment.photo_names,
      enrichment.photo_attributions,
    ).length === 0
  ) {
    return "backfill_photo_attribution";
  }
  return "investigate_photo_publication";
}

export function placeDataGapReason(
  dimension: PlaceDataGapDimension,
  place: PlaceDataCoveragePlace,
  evidence: PlaceDataGapEvidence = {},
  now: Date = new Date(),
): PlaceDataGapReason {
  if (dimension === "copy") return copyGapReason(place, evidence);
  if (dimension === "hours") return hoursGapReason(place, evidence, now);
  return photoGapReason(place, evidence);
}

/**
 * Return the highest-priority public places missing copy, current hours, or a
 * publishable photo. The same strict coverage predicates used by release
 * reporting decide each gap, so the queue cannot call stale hours current or
 * an unattributed provider image publishable.
 */
export function prioritizePlaceDataGaps<
  T extends PlaceDataCoveragePlace,
>(
  places: readonly T[],
  options: PlaceDataPriorityOptions & {
    evidence?: PlaceDataGapEvidence;
    limit?: number;
    now?: Date;
  } = {},
): PlaceDataGapRow<T>[] {
  const now = options.now ?? new Date();
  const copyCounts = decisionCopyCounts(places);
  const rows = places.flatMap((place) => {
    const gaps: PlaceDataGapDimension[] = [];
    if (!hasUsefulDecisionCopy(place, copyCounts)) gaps.push("copy");
    if (!hasPublishedFreshHours(place, now)) gaps.push("hours");
    if (!hasUsefulPhoto(place)) gaps.push("photo");
    return gaps.length
      ? [{
          place,
          gaps,
          reasons: Object.fromEntries(
            gaps.map((dimension) => [
              dimension,
              placeDataGapReason(
                dimension,
                place,
                options.evidence,
                now,
              ),
            ]),
          ) as Partial<
            Record<PlaceDataGapDimension, PlaceDataGapReason>
          >,
          priorityLabel: placeDataPriorityLabel(place),
        }]
      : [];
  });

  rows.sort((a, b) =>
    comparePlaceDataPriority(a.place, b.place, options),
  );
  return options.limit == null ? rows : rows.slice(0, options.limit);
}
