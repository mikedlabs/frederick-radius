import type { OperationalStatus } from "@/data/places";
import {
  activeManualPlaceStatusOverride,
  isIsoCalendarDate,
  isManualPlaceClosureOverride,
  manualPlaceStatusOverride,
} from "@/lib/place-status-overrides";
import { easternDayKey } from "@/lib/tz";

/** Only the accepted base verdict and a dependent correction's deadline ship. */
export type CompactOperationalCorrection = {
  fallback_status: OperationalStatus;
  review_after?: string;
};

export function compactOperationalCorrection(
  slug: string,
  fallback: OperationalStatus | undefined,
  now = new Date(),
): CompactOperationalCorrection | undefined {
  const correction = activeManualPlaceStatusOverride(slug, now);
  if (correction?.status !== "operational") return undefined;
  return {
    fallback_status: fallback ?? "needs_verification",
    // An independently accepted operational verdict does not depend on the
    // manual correction and must not inherit its expiration date.
    ...(fallback !== "operational" ? { review_after: correction.review_after } : {}),
  };
}

type OperationalPlace = {
  slug: string;
  is_operational?: OperationalStatus;
  operational_correction?: CompactOperationalCorrection;
};
const isClosed = (status: OperationalStatus | undefined) =>
  status === "closed_temporarily" || status === "closed_permanently";
const validStatuses = new Set<OperationalStatus>([
  "operational", "closed_temporarily", "closed_permanently", "needs_verification",
]);

/** Client-safe counterpart to the server's reviewed manual status policy. */
export function clientPlaceOperationalState(place: OperationalPlace, now = new Date()): {
  status: OperationalStatus | undefined;
  discoverable: boolean;
  mayAssertHours: boolean;
} {
  const manual = activeManualPlaceStatusOverride(place.slug, now);
  if (isManualPlaceClosureOverride(manual)) {
    return { status: manual.status, discoverable: false, mayAssertHours: false };
  }
  const policy = place.operational_correction;
  const validPolicy = policy && typeof policy === "object" && !Array.isArray(policy) &&
    validStatuses.has(policy.fallback_status) &&
    (policy.review_after === undefined || isIsoCalendarDate(policy.review_after));
  if (validPolicy && policy.fallback_status === "operational" && policy.review_after === undefined) {
    return { status: "operational", discoverable: true, mayAssertHours: true };
  }
  const hasCorrection = policy !== undefined || manualPlaceStatusOverride(place.slug)?.status === "operational";
  if (!hasCorrection) {
    return { status: place.is_operational, discoverable: !isClosed(place.is_operational), mayAssertHours: !isClosed(place.is_operational) };
  }
  if (manual?.status === "operational" &&
      (!validPolicy || (policy.review_after !== undefined && easternDayKey(now) <= policy.review_after))) {
    return { status: "operational", discoverable: true, mayAssertHours: true };
  }
  // Expiration is a missed review, not evidence of a new business closure.
  // Keep saved/detail identity with an unknown status, while the accepted
  // base closure still suppresses discovery. Missing legacy fallback evidence
  // also fails conservatively instead of keeping a build-time open promise.
  return {
    status: "needs_verification",
    discoverable: Boolean(validPolicy && policy.review_after !== undefined && !isClosed(policy.fallback_status)),
    mayAssertHours: false,
  };
}
