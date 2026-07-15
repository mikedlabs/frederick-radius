import type { OperationalStatus } from "@/data/places";
import RAW from "@/data/place-status-overrides.json" with { type: "json" };

export type ManualPlaceStatusOverride = {
  status: Extract<OperationalStatus, "closed_temporarily" | "closed_permanently">;
  effective_at: string;
  review_after: string;
  source: string;
  note: string;
};

export const MANUAL_PLACE_STATUS_OVERRIDES = RAW as Record<
  string,
  ManualPlaceStatusOverride
>;

export function manualPlaceStatusOverride(
  slug: string,
): ManualPlaceStatusOverride | undefined {
  return Object.hasOwn(MANUAL_PLACE_STATUS_OVERRIDES, slug)
    ? MANUAL_PLACE_STATUS_OVERRIDES[slug]
    : undefined;
}

/** Review deadlines are alarms, not automatic reopen dates. A missed review
 * keeps the safety override active and fails the data gate until a person
 * confirms that the closure is still current or removes it. */
export function isManualPlaceStatusReviewCurrent(
  override: ManualPlaceStatusOverride,
  now: Date = new Date(),
): boolean {
  return now.toISOString().slice(0, 10) <= override.review_after;
}
