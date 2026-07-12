/**
 * Drift-review data layer — reads the vet-places artifact (committed JSON) and
 * tracks editor accept/reject decisions on each drifted field.
 *
 * Decisions persist to the `curation_decisions` Supabase table (tool = 'drift',
 * target_id = slug, field = the drifted field) — NOT a local file — so the
 * owner can accept/reject drift from prod or a phone. Fail-soft: no
 * DATABASE_URL degrades to zero decisions.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { getSql } from "@/lib/db/client";

const DRIFT_PATH = path.join(process.cwd(), "data/place-drift.json");

export type DriftField =
  | "business_status"
  | "name"
  | "phone"
  | "website"
  | "hours"
  | "rating"
  | "address";

export type DriftChange = {
  field: DriftField;
  before: string | number | null;
  after: string | number | null;
};

export type DriftRow = {
  slug: string;
  google_place_id: string;
  detected_at: string;
  changes: DriftChange[];
};

export type DriftFile = {
  generated_at: string;
  total_checked: number;
  drift_count: number;
  rows: DriftRow[];
};

export type DriftDecision = "accepted" | "rejected";

let _cache: DriftFile | null = null;

export function getDrift(): DriftFile {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(readFileSync(DRIFT_PATH, "utf8")) as DriftFile;
    return _cache;
  } catch {
    _cache = { generated_at: "", total_checked: 0, drift_count: 0, rows: [] };
    return _cache;
  }
}

/** Decisions are keyed by `${slug}::${field}` so each field change can be
 *  accepted or rejected independently. */
function decisionKey(slug: string, field: DriftField): string {
  return `${slug}::${field}`;
}

/** All recorded drift decisions, keyed by `${slug}::${field}`. DB-backed. */
export async function getDecisions(): Promise<Record<string, DriftDecision>> {
  const sql = getSql();
  if (!sql) return {};
  try {
    const rows = (await sql`
      select target_id, field, decision from curation_decisions where tool = 'drift'
    `) as { target_id: string; field: string; decision: string }[];
    const out: Record<string, DriftDecision> = {};
    for (const r of rows) {
      if (r.decision === "accepted" || r.decision === "rejected") {
        out[`${r.target_id}::${r.field}`] = r.decision;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function recordDecision(
  slug: string,
  field: DriftField,
  decision: DriftDecision | "clear",
): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  if (decision === "clear") {
    await sql`delete from curation_decisions where tool='drift' and target_id=${slug} and field=${field}`;
    return;
  }
  await sql`
    insert into curation_decisions (tool, target_id, field, decision, decided_at)
    values ('drift', ${slug}, ${field}, ${decision}, now())
    on conflict (tool, target_id, field) do update set decision = excluded.decision, decided_at = now()
  `;
}

export type DriftStats = {
  drift_rows: number;
  total_changes: number;
  accepted: number;
  rejected: number;
  undecided: number;
  last_sweep_at: string;
};

/** Pure — pass the already-loaded decisions so the page queries the DB once. */
export function getDriftStats(
  file: DriftFile,
  decisions: Record<string, DriftDecision>,
): DriftStats {
  let total = 0;
  let accepted = 0;
  let rejected = 0;
  for (const row of file.rows) {
    for (const ch of row.changes) {
      total += 1;
      const d = decisions[decisionKey(row.slug, ch.field)];
      if (d === "accepted") accepted += 1;
      else if (d === "rejected") rejected += 1;
    }
  }
  return {
    drift_rows: file.rows.length,
    total_changes: total,
    accepted,
    rejected,
    undecided: total - accepted - rejected,
    last_sweep_at: file.generated_at,
  };
}

export { decisionKey };
