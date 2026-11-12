import type { PlaceCardPhotoPlan } from "@/lib/place-card-photo";
import { easternDayKey } from "@/lib/tz";

/** A source/rights review is separate from confirming that the pictured
 * merchant still looks this way. Approvals apply to one exact source only. */
export type TodayPhotoAppearanceReview = Readonly<{
  slug: string;
  src: string;
  appearance: "current";
  reviewedOn: string;
  /** Inclusive New York date explicitly chosen by the appearance reviewer. */
  validUntil: string;
  evidence: string;
}>;

/** No existing merchant photograph has an accepted current-appearance review.
 * Do not infer one from ownership, capture age, license or provider credit. */
export const TODAY_PHOTO_APPEARANCE_REVIEWS: readonly TodayPhotoAppearanceReview[] = Object.freeze([]);

function calendarDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
}

export function hasTodayPhotoAppearanceReview(
  slug: string,
  src: string | null,
  reviews: readonly TodayPhotoAppearanceReview[] = TODAY_PHOTO_APPEARANCE_REVIEWS,
  asOf: Date = new Date(),
): boolean {
  if (!src || !Number.isFinite(asOf.getTime())) return false;
  const today = easternDayKey(asOf);
  return reviews.some(review => {
    const reviewedOn = calendarDay(review.reviewedOn), validUntil = calendarDay(review.validUntil);
    return review.slug === slug && review.src === src && review.appearance === "current" &&
      Boolean(reviewedOn && validUntil && reviewedOn <= today && today <= validUntil) &&
      review.evidence.trim().length > 0;
  });
}

/** Today is a present-day decision surface. Historical identity photographs
 * remain in their registries, but cannot silently become a merchant lead. */
export function todayAppearancePhotoPlan(
  slug: string,
  plan: PlaceCardPhotoPlan,
  reviews: readonly TodayPhotoAppearanceReview[] = TODAY_PHOTO_APPEARANCE_REVIEWS,
  asOf: Date = new Date(),
): PlaceCardPhotoPlan {
  const sources = plan.sources.filter(source => hasTodayPhotoAppearanceReview(slug, source.src, reviews, asOf));
  return { key: JSON.stringify([plan.key, "today-current-appearance", sources]), sources };
}
