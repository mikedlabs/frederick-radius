/**
 * Weekly freshness check.
 *
 * It flags any active source whose last_success is missing or older
 * than its declared refresh_cadence allows. The intent is to catch a
 * source that quietly stopped updating even though fetches still
 * succeed, which a daily error check would miss.
 *
 * Exit code is non zero when anything is stale, so the weekly Action
 * can open issues.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST =
  process.env.SOURCE_MANIFEST ?? join(ROOT, "data", "sources.yaml");

// Maximum age in hours before a source is considered stale, with a
// grace allowance so a slightly late refresh does not page anyone.
const MAX_AGE_HOURS: Record<string, number> = {
  realtime: 2,
  hourly: 3,
  daily: 36,
  weekly: 240,
  monthly: 960,
  yearly: 9600,
};

type Row = {
  id: string;
  status: string;
  collection?: "pipeline" | "runtime" | "workflow";
  refresh_cadence: string;
  last_success: string | null;
};

function main(): void {
  const doc = parse(readFileSync(MANIFEST, "utf8")) as { sources: Row[] };
  const active = doc.sources.filter((r) => r.status === "active");
  const missingOwner = active.filter(
    (r) => !["pipeline", "runtime", "workflow"].includes(r.collection ?? ""),
  );
  const managed = active.filter((r) => r.collection === "pipeline");
  const stale: string[] = [];

  for (const row of missingOwner) {
    stale.push(`${row.id}: active source has no collection owner`);
  }

  for (const row of managed) {
    // on_demand sources are not scheduled, so freshness does not apply.
    const limit = MAX_AGE_HOURS[row.refresh_cadence];
    if (limit === undefined) continue;

    if (!row.last_success) {
      stale.push(`${row.id}: never succeeded`);
      continue;
    }
    const ageHours = (Date.now() - new Date(row.last_success).getTime()) / 3_600_000;
    if (!Number.isFinite(ageHours) || ageHours > limit) {
      stale.push(`${row.id}: last success ${row.last_success}, cadence ${row.refresh_cadence}, age ${ageHours.toFixed(1)}h exceeds ${limit}h`);
    }
  }

  if (stale.length > 0) {
    console.error(`Stale sources (${stale.length}):`);
    for (const s of stale) console.error(`  ${s}`);
    process.exitCode = 1;
  } else {
    console.log(
      `All ${managed.length} pipeline-managed sources are within their refresh cadence. ` +
      `${active.length - managed.length} runtime/workflow sources are outside this manifest timestamp check and must be verified in their owning monitors.`,
    );
  }
}

main();
