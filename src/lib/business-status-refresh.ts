import type { OperationalStatus } from "@/data/places";

export type BusinessStatusRefreshEntry = {
  is_operational: OperationalStatus;
  refreshed_at: string;
};

export type HoursStatusRefreshEntry = {
  business_status?: string;
  refreshed_at: string;
};

export type ResolvedBusinessStatus = {
  status: OperationalStatus;
  refreshed_at: string;
  source: "business_status" | "hours_refresh";
};

function googleStatusToOperational(
  value: string | undefined,
): OperationalStatus | undefined {
  switch (value) {
    case "OPERATIONAL":
      return "operational";
    case "CLOSED_TEMPORARILY":
      return "closed_temporarily";
    case "CLOSED_PERMANENTLY":
      return "closed_permanently";
    case "UNKNOWN":
      return "needs_verification";
    default:
      return undefined;
  }
}

function validTimestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Resolve the newest persisted Google status for a place.
 *
 * Two independent refresh jobs can carry business status:
 * the low-cost status sweep committed by the data-steward workflow, and the
 * rolling hours snapshot pulled from Postgres. Whichever was verified most
 * recently wins. Invalid or unknown rows never override a usable status.
 */
export function resolveRefreshedBusinessStatus(
  business: BusinessStatusRefreshEntry | undefined,
  hours: HoursStatusRefreshEntry | undefined,
): ResolvedBusinessStatus | undefined {
  const candidates: ResolvedBusinessStatus[] = [];

  if (
    business &&
    validTimestamp(business.refreshed_at) !== Number.NEGATIVE_INFINITY &&
    business.is_operational !== "needs_verification"
  ) {
    candidates.push({
      status: business.is_operational,
      refreshed_at: business.refreshed_at,
      source: "business_status",
    });
  }

  const hoursStatus = googleStatusToOperational(hours?.business_status);
  if (
    hours &&
    hoursStatus &&
    hoursStatus !== "needs_verification" &&
    validTimestamp(hours.refreshed_at) !== Number.NEGATIVE_INFINITY
  ) {
    candidates.push({
      status: hoursStatus,
      refreshed_at: hours.refreshed_at,
      source: "hours_refresh",
    });
  }

  return candidates.sort(
    (a, b) => validTimestamp(b.refreshed_at) - validTimestamp(a.refreshed_at),
  )[0];
}

/**
 * Pick a different bounded slice each day instead of checking the same first
 * N places forever. The wrap keeps every target reachable when the catalog
 * size is not an exact multiple of the batch size.
 */
export function selectRotatingStatusTargets<T>(
  targets: readonly T[],
  batchSize: number,
  cycleIndex: number,
): T[] {
  if (targets.length === 0 || batchSize <= 0) return [];
  if (batchSize >= targets.length) return [...targets];

  const start =
    ((Math.trunc(cycleIndex) * batchSize) % targets.length + targets.length) %
    targets.length;
  return Array.from(
    { length: batchSize },
    (_, index) => targets[(start + index) % targets.length],
  );
}
