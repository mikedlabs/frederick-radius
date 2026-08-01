/**
 * Daily freshness check.
 *
 * It flags any active source whose last_success is missing or older
 * than its declared snapshot_cadence (or refresh_cadence fallback) allows.
 * The intent is to catch a source that quietly stopped updating even though
 * fetches still succeed, which a daily error check would miss.
 *
 * Exit code is non zero when anything is stale, so the scheduled Action
 * can open issues.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  FRESHNESS_FUTURE_SKEW_MS,
  isFutureFreshnessTimestamp,
  mergeFreshnessState,
  type FreshnessSourceRow,
} from "./lib/freshness_state";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CURRENT_MANIFEST = join(ROOT, "data", "sources.yaml");
const POLICY_MANIFEST =
  process.env.SOURCE_POLICY_MANIFEST ??
  (process.env.SOURCE_STATE_MANIFEST
    ? CURRENT_MANIFEST
    : process.env.SOURCE_MANIFEST ?? CURRENT_MANIFEST);
const STATE_MANIFEST = process.env.SOURCE_STATE_MANIFEST;

// Maximum age in hours before a source is considered stale, with a
// grace allowance so a slightly late refresh does not page anyone.
const MAX_AGE_HOURS: Record<string, number> = {
  realtime: 2,
  hourly: 3,
  daily: 36,
  weekly: 240,
  monthly: 960,
  quarterly: 2400,
  yearly: 9600,
};

function baseCadence(value: string): string {
  return value.trim().split(/\s+/, 1)[0] ?? "";
}

function main(): void {
  const nowMs = Date.now();
  const policy = parse(readFileSync(POLICY_MANIFEST, "utf8")) as {
    sources: FreshnessSourceRow[];
  };
  const state = STATE_MANIFEST
    ? (parse(readFileSync(STATE_MANIFEST, "utf8")) as {
        sources: FreshnessSourceRow[];
      })
    : undefined;
  const rows = state
    ? mergeFreshnessState(policy.sources, state.sources, new Date(nowMs))
    : policy.sources;
  const active = rows.filter((r) => r.status === "active");
  const missingOwner = active.filter(
    (r) => !["pipeline", "runtime", "workflow"].includes(r.collection ?? ""),
  );
  const managed = active.filter((r) => r.collection === "pipeline");
  const stale: string[] = [];

  // Generated state is untrusted observation data. The merge rejects a
  // far-future value so it cannot replace an older policy timestamp; retain a
  // visible failure as well so corruption is fixed instead of silently hidden.
  for (const row of state?.sources ?? []) {
    for (const field of ["last_success", "last_changed"] as const) {
      const value = row[field];
      if (isFutureFreshnessTimestamp(value, nowMs)) {
        stale.push(
          `${row.id}: snapshot state ${field} ${value} is more than ${FRESHNESS_FUTURE_SKEW_MS / 60_000}m in the future`,
        );
      }
    }
  }

  for (const row of missingOwner) {
    stale.push(`${row.id}: active source has no collection owner`);
  }

  for (const row of managed) {
    // on_demand sources are not scheduled, so freshness does not apply.
    const cadence = row.snapshot_cadence ?? baseCadence(row.refresh_cadence);
    if (cadence === "on_demand") continue;
    const limit = MAX_AGE_HOURS[cadence];
    if (limit === undefined) {
      stale.push(`${row.id}: unsupported snapshot cadence ${cadence}`);
      continue;
    }

    if (!row.last_success) {
      stale.push(`${row.id}: never succeeded`);
      continue;
    }
    const successTime = Date.parse(row.last_success);
    const ageHours = (nowMs - successTime) / 3_600_000;
    if (!Number.isFinite(successTime)) {
      stale.push(`${row.id}: invalid last success ${row.last_success}`);
    } else if (isFutureFreshnessTimestamp(row.last_success, nowMs)) {
      stale.push(`${row.id}: last success ${row.last_success} is in the future`);
    } else if (ageHours > limit) {
      stale.push(`${row.id}: last success ${row.last_success}, snapshot cadence ${cadence}, age ${ageHours.toFixed(1)}h exceeds ${limit}h`);
    }

    if (row.change_cadence) {
      const changeLimit = MAX_AGE_HOURS[row.change_cadence];
      if (changeLimit === undefined) {
        stale.push(`${row.id}: unsupported change cadence ${row.change_cadence}`);
      } else if (!row.last_changed) {
        stale.push(`${row.id}: payload change has never been recorded`);
      } else {
        const changedTime = Date.parse(row.last_changed);
        const changeAgeHours = (nowMs - changedTime) / 3_600_000;
        if (!Number.isFinite(changedTime)) {
          stale.push(`${row.id}: invalid last changed ${row.last_changed}`);
        } else if (isFutureFreshnessTimestamp(row.last_changed, nowMs)) {
          stale.push(`${row.id}: last changed ${row.last_changed} is in the future`);
        } else if (changeAgeHours > changeLimit) {
          stale.push(
            `${row.id}: payload unchanged since ${row.last_changed}, change cadence ${row.change_cadence}, age ${changeAgeHours.toFixed(1)}h exceeds ${changeLimit}h`,
          );
        }
      }
    }
  }

  if (stale.length > 0) {
    console.error(`Stale sources (${stale.length}):`);
    for (const s of stale) console.error(`  ${s}`);
    process.exitCode = 1;
  } else {
    console.log(
      `All ${managed.length} pipeline-managed sources are within their snapshot policy. ` +
      `${active.length - managed.length} runtime/workflow sources are outside this manifest timestamp check and must be verified in their owning monitors.`,
    );
  }
}

main();
