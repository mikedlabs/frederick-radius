import type { Hours } from "@/data/places";
import type { OpenStatus } from "@/lib/hours";
import { mayAssertOpenState } from "@/lib/hours-freshness";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";

export const OPEN_NOW_MINIMUM_COVERAGE = 0.6;

export type HoursAvailabilityPlace = {
  slug: string;
  hours?: Hours;
  hours_verified?: boolean;
  hours_updated_at?: string;
};

export type HoursAvailabilityStatus =
  | "available"
  | "insufficient"
  | "empty";

export type HoursAvailability = {
  status: HoursAvailabilityStatus;
  /** Whether an Open now control may honestly be enabled. */
  enabled: boolean;
  total: number;
  reliable: number;
  /** Ratio in [0, 1]. */
  coverage: number;
  minimumCoverage: number;
  checkedAt: string;
  source: "current-verified-hours";
};

/**
 * Whether an empty open-now result may be stated as "nothing is open."
 *
 * Zero results has two causes a reader cannot tell apart: every one of these
 * places really is closed, or none of them cleared the verified-hours bar.
 * Radius only ever knows the second. Reporting the first turns a gap in our
 * own coverage into a claim about the county, and while verified-hours
 * coverage sits near zero that claim is usually wrong.
 *
 * Decided from open_status because that is where the freshness and
 * visitability policy has already been applied: open, closing-soon, and
 * closed are answers; unverified and unknown are silence. The bar is the same
 * one the Open now control uses to decide whether it may exist at all.
 */
export function mayAssertNoneOpen(
  statuses: readonly OpenStatus[],
  minimumCoverage: number = OPEN_NOW_MINIMUM_COVERAGE,
): boolean {
  if (statuses.length === 0) return false;
  const decided = statuses.filter(
    (status) =>
      status.state === "open" ||
      status.state === "closing-soon" ||
      status.state === "closed",
  ).length;
  return decided / statuses.length >= minimumCoverage;
}

/**
 * Turn a confirmed-open count into a compact UI label without turning an
 * hours-coverage gap into a claim that a place is closed.
 */
export function openNowCountLabel(
  confirmedOpen: number,
  mayReportNoneOpen: boolean,
): string {
  if (confirmedOpen > 0) {
    return `${confirmedOpen.toLocaleString("en-US")} confirmed open`;
  }
  return mayReportNoneOpen ? "None open now" : "Open hours unconfirmed";
}

/**
 * The filter remains useful when at least one result is confirmed open. With
 * a zero count, it only becomes available after the same coverage gate that
 * permits the UI to say none are open.
 */
export function mayOfferOpenNow(statuses: readonly OpenStatus[]): boolean {
  return (
    statuses.some(
      (status) =>
        status.state === "open" || status.state === "closing-soon",
    ) || mayAssertNoneOpen(statuses)
  );
}

export function hasReliableHours(
  place: HoursAvailabilityPlace,
  now: Date = new Date(),
): boolean {
  return Boolean(
    place.hours &&
      Object.keys(place.hours).length > 0 &&
      mayAssertOpenState(
        place.hours_verified,
        place.hours_updated_at,
        now,
      ) &&
      mayPublishVisitabilityHours(place.slug, place.hours, now),
  );
}

/**
 * One honest availability envelope for every Open now surface. It reports the
 * exact numerator and denominator rather than allowing a UI to infer that a
 * zero result means "nothing is open." Below the coverage threshold the
 * control is disabled/hidden; no hours are fabricated to fill the gap.
 */
export function getHoursAvailability(
  places: readonly HoursAvailabilityPlace[],
  options: {
    now?: Date;
    minimumCoverage?: number;
  } = {},
): HoursAvailability {
  const now = options.now ?? new Date();
  const minimumCoverage =
    options.minimumCoverage ?? OPEN_NOW_MINIMUM_COVERAGE;
  const total = places.length;
  const reliable = places.filter((place) =>
    hasReliableHours(place, now),
  ).length;
  const coverage = total > 0 ? reliable / total : 0;
  const status: HoursAvailabilityStatus =
    total === 0
      ? "empty"
      : coverage >= minimumCoverage
        ? "available"
        : "insufficient";

  return {
    status,
    enabled: status === "available",
    total,
    reliable,
    coverage,
    minimumCoverage,
    checkedAt: now.toISOString(),
    source: "current-verified-hours",
  };
}
