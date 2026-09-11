/**
 * Discovered-review data layer.
 *
 * Reads the ~1,060-row Phase-2 enrichment artifact (committed JSON) and tracks
 * editor decisions (approve / reject) so the admin review page can triage
 * candidates one at a time.
 *
 * Decisions persist to the `curation_decisions` Supabase table (tool =
 * 'discovered', target_id = google_place_id) — NOT a local file — so the owner
 * can curate from prod or a phone, not only a dev checkout. `scripts/
 * merge-discovered.ts` reads the same table to emit Place records into the
 * canonical directory. Fail-soft: no DATABASE_URL degrades to zero decisions.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { getSql } from "@/lib/db/client";

const ENRICHED_PATH = path.join(process.cwd(), "src/data/discovered-enriched.json");

export type Decision = "approved" | "rejected";

export type DiscoveredCandidate = {
  google_place_id: string;
  name: string;
  address?: string;
  primary_type?: string;
  detail_primary_type?: string;
  municipality: string;
  lat: number;
  lng: number;
  business_status?: string;
  weekday_hours?: string[];
  has_hours?: boolean;
  rating?: number;
  user_rating_count?: number;
  photo_names?: string[];
  phone?: string;
  website?: string;
  editorial_summary?: string;
  review_snippet?: string;
  review_author?: string;
  discovered_for?: { category: string; area: string };
};

let _cache: DiscoveredCandidate[] | null = null;

export function getCandidates(): DiscoveredCandidate[] {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(readFileSync(ENRICHED_PATH, "utf8")) as DiscoveredCandidate[];
    return _cache;
  } catch {
    _cache = [];
    return _cache;
  }
}

/** All recorded decisions, keyed by google_place_id. DB-backed; {} if no DB. */
export async function getDecisions(): Promise<Record<string, Decision>> {
  const sql = getSql();
  if (!sql) return {};
  try {
    const rows = (await sql`
      select target_id, decision from curation_decisions where tool = 'discovered'
    `) as { target_id: string; decision: string }[];
    const out: Record<string, Decision> = {};
    for (const r of rows) {
      if (r.decision === "approved" || r.decision === "rejected") out[r.target_id] = r.decision;
    }
    return out;
  } catch {
    return {};
  }
}

export async function recordDecision(placeId: string, decision: Decision | "clear"): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  if (decision === "clear") {
    await sql`delete from curation_decisions where tool='discovered' and target_id=${placeId} and field=''`;
    return;
  }
  await sql`
    insert into curation_decisions (tool, target_id, field, decision, decided_at)
    values ('discovered', ${placeId}, '', ${decision}, now())
    on conflict (tool, target_id, field) do update set decision = excluded.decision, decided_at = now()
  `;
}

/** Approved google_place_ids — the merge script's input. */
export async function getApprovedIds(): Promise<string[]> {
  const sql = getSql();
  if (!sql) return [];
  try {
    const rows = (await sql`
      select target_id from curation_decisions where tool='discovered' and decision='approved'
    `) as { target_id: string }[];
    return rows.map((r) => r.target_id);
  } catch {
    return [];
  }
}

export type ReviewStats = {
  total: number;
  approved: number;
  rejected: number;
  undecided: number;
};

/** Pure — pass the already-loaded decisions so the page queries the DB once. */
export function getStats(
  candidates: DiscoveredCandidate[],
  decisions: Record<string, Decision>,
): ReviewStats {
  let approved = 0;
  let rejected = 0;
  for (const id of Object.keys(decisions)) {
    if (decisions[id] === "approved") approved += 1;
    else if (decisions[id] === "rejected") rejected += 1;
  }
  return {
    total: candidates.length,
    approved,
    rejected,
    undecided: candidates.length - approved - rejected,
  };
}

/** First undecided candidate after the given index (wraps). Pure. */
export function nextUndecidedIndex(
  fromIndex: number,
  candidates: DiscoveredCandidate[],
  decisions: Record<string, Decision>,
): number {
  const n = candidates.length;
  if (n === 0) return -1;
  for (let step = 1; step <= n; step++) {
    const i = (fromIndex + step) % n;
    if (!decisions[candidates[i].google_place_id]) return i;
  }
  return -1;
}
