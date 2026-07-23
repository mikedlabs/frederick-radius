import type { Hours } from "@/data/places";
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
