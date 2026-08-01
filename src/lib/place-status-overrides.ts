import RAW from "@/data/place-status-overrides.json" with { type: "json" };

type ManualPlaceStatusEvidence = {
  effective_at: string;
  review_after: string;
  source: string;
  note: string;
};

export type ManualPlaceClosureOverride = ManualPlaceStatusEvidence & {
  status: "closed_temporarily" | "closed_permanently";
};

/**
 * A narrow, reviewed correction for a provider false-positive closure.
 *
 * This is not a permanent "trust us" flag: it needs an HTTPS first-party
 * source and a review deadline. The correction stops overriding provider data
 * after that deadline, while the data-quality gate raises the missed review.
 */
export type ManualPlaceOperationalCorrection = ManualPlaceStatusEvidence & {
  status: "operational";
};

export type ManualPlaceStatusOverride =
  | ManualPlaceClosureOverride
  | ManualPlaceOperationalCorrection;

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

export function isManualPlaceClosureOverride(
  override: ManualPlaceStatusOverride | undefined,
): override is ManualPlaceClosureOverride {
  return Boolean(
    override &&
      (override.status === "closed_temporarily" ||
        override.status === "closed_permanently"),
  );
}

export function isManualPlaceOperationalCorrection(
  override: ManualPlaceStatusOverride | undefined,
): override is ManualPlaceOperationalCorrection {
  return override?.status === "operational";
}

export function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function hasValidManualPlaceStatusEvidence(
  override: ManualPlaceStatusOverride,
): boolean {
  if (
    (!isManualPlaceClosureOverride(override) &&
      !isManualPlaceOperationalCorrection(override)) ||
    !isIsoCalendarDate(override.effective_at) ||
    !isIsoCalendarDate(override.review_after) ||
    override.effective_at > override.review_after ||
    !override.note.trim()
  ) {
    return false;
  }

  try {
    return new URL(override.source).protocol === "https:";
  } catch {
    return false;
  }
}

/** Review deadlines are alarms. A missed closure review is not an automatic
 * reopening; a missed operational-correction review is handled conservatively
 * by activeManualPlaceStatusOverride below. */
export function isManualPlaceStatusReviewCurrent(
  override: ManualPlaceStatusOverride,
  now: Date = new Date(),
): boolean {
  return (
    isIsoCalendarDate(override.review_after) &&
    now.toISOString().slice(0, 10) <= override.review_after
  );
}

/**
 * Safety closures remain active after a missed review so a calendar deadline
 * cannot silently reopen a closed place. Operational corrections are safer in
 * the opposite direction: they apply only during their reviewed window, then
 * fall back to the newest provider status until a person reconfirms them.
 */
export function activeManualPlaceStatusOverride(
  slug: string,
  now: Date = new Date(),
): ManualPlaceStatusOverride | undefined {
  const override = manualPlaceStatusOverride(slug);
  if (!override) return undefined;
  if (isManualPlaceClosureOverride(override)) return override;
  if (!hasValidManualPlaceStatusEvidence(override)) return undefined;

  const today = now.toISOString().slice(0, 10);
  return override.effective_at <= today &&
    isManualPlaceStatusReviewCurrent(override, now)
    ? override
    : undefined;
}
