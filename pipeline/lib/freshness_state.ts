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

function newestTimestamp(
  policyValue: string | null | undefined,
  stateValue: string | null | undefined,
): string | null | undefined {
  const policyTime = typeof policyValue === "string" ? Date.parse(policyValue) : Number.NaN;
  const stateTime = typeof stateValue === "string" ? Date.parse(stateValue) : Number.NaN;

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
): FreshnessSourceRow[] {
  const stateById = new Map(stateRows.map((row) => [row.id, row]));

  return policyRows.map((policy) => {
    const state = stateById.get(policy.id);
    if (!state) return policy;

    return {
      ...policy,
      last_success: newestTimestamp(policy.last_success, state.last_success) ?? null,
      last_changed: newestTimestamp(policy.last_changed, state.last_changed),
    };
  });
}
