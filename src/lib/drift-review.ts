/**
 * Drift-review data layer — reads the vet-places artifact and tracks
 * editor accept/reject decisions on each field change.
 *
 * Same persistence pattern as discovered-review.ts: a local JSON file
 * under `data/drift-decisions.json`. Dev-mode only.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const DRIFT_PATH = path.join(process.cwd(), "data/place-drift.json");
const DECISIONS_PATH = path.join(process.cwd(), "data/drift-decisions.json");

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
    _cache = {
      generated_at: "",
      total_checked: 0,
      drift_count: 0,
      rows: [],
    };
    return _cache;
  }
}

/** Decisions are keyed by `${slug}::${field}` so each field change
 *  can be accepted or rejected independently. */
function decisionKey(slug: string, field: DriftField): string {
  return `${slug}::${field}`;
}

type DecisionsFile = {
  decisions: Record<string, DriftDecision>;
  updated_at: string;
};

function loadDecisions(): DecisionsFile {
  try {
    return JSON.parse(readFileSync(DECISIONS_PATH, "utf8")) as DecisionsFile;
  } catch {
    return { decisions: {}, updated_at: new Date().toISOString() };
  }
}

function saveDecisions(d: DecisionsFile): void {
  const dir = path.dirname(DECISIONS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  d.updated_at = new Date().toISOString();
  writeFileSync(DECISIONS_PATH, JSON.stringify(d, null, 2));
}

export function getDecisions(): Record<string, DriftDecision> {
  return loadDecisions().decisions;
}

export function recordDecision(
  slug: string,
  field: DriftField,
  decision: DriftDecision | "clear",
): void {
  const file = loadDecisions();
  const key = decisionKey(slug, field);
  if (decision === "clear") delete file.decisions[key];
  else file.decisions[key] = decision;
  saveDecisions(file);
}

export type DriftStats = {
  drift_rows: number;
  total_changes: number;
  accepted: number;
  rejected: number;
  undecided: number;
  last_sweep_at: string;
};

export function getDriftStats(): DriftStats {
  const file = getDrift();
  const decisions = getDecisions();
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
