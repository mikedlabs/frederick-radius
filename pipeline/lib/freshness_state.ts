export type FreshnessSourceRow = {
  id: string;
  status: string;
  collection?: "pipeline" | "runtime" | "workflow";
  refresh_cadence: string;
  snapshot_cadence?: string;
  change_cadence?: string;
  last_success: string | null;
  last_changed?: string | null;
};

/** Allow small clock differences between the runner and a source publisher,
 * but never let a far-future timestamp make an old snapshot look fresh. */
export const FRESHNESS_FUTURE_SKEW_MS = 5 * 60_000;

export function isFutureFreshnessTimestamp(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) &&
    timestamp > nowMs + FRESHNESS_FUTURE_SKEW_MS
  );
}

function newestTimestamp(
  policyValue: string | null | undefined,
  stateValue: string | null | undefined,
  nowMs: number,
): string | null | undefined {
  const policyTime =
    typeof policyValue === "string" &&
    !isFutureFreshnessTimestamp(policyValue, nowMs)
      ? Date.parse(policyValue)
      : Number.NaN;
  const stateTime =
    typeof stateValue === "string" &&
    !isFutureFreshnessTimestamp(stateValue, nowMs)
      ? Date.parse(stateValue)
      : Number.NaN;

  if (Number.isFinite(stateTime) && (!Number.isFinite(policyTime) || stateTime > policyTime)) {
    return stateValue;
  }
  return policyValue;
}

/**
 * Keep source ownership and cadence on the trusted current branch while
 * importing only the latest observed timestamps from the generated snapshot.
 * A snapshot can legitimately predate a policy change, so it must never be
 * allowed to restore stale cadence or status fields.
 */
export function mergeFreshnessState(
  policyRows: FreshnessSourceRow[],
  stateRows: FreshnessSourceRow[],
  now: Date = new Date(),
): FreshnessSourceRow[] {
  const stateById = new Map(stateRows.map((row) => [row.id, row]));
  const nowMs = now.getTime();

  return policyRows.map((policy) => {
    const state = stateById.get(policy.id);
    if (!state) return policy;

    return {
      ...policy,
      last_success:
        newestTimestamp(policy.last_success, state.last_success, nowMs) ?? null,
      last_changed: newestTimestamp(
        policy.last_changed,
        state.last_changed,
        nowMs,
      ),
    };
  });
}
