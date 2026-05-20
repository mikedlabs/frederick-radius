/**
 * Discovered-review data layer.
 *
 * Reads the 1,060-row Phase-2 enrichment artifact and tracks
 * editor decisions (approve / reject / skip) so the admin review
 * page can triage candidates one at a time.
 *
 * Persistence is a local JSON file under `data/discovered-decisions.json`
 * — dev-mode only. Production Vercel deployments have a read-only fs,
 * which is the right safety: the admin review tool runs locally on
 * the owner's machine where file writes are the simplest, most
 * auditable persistence. Once the editor finishes the review,
 * `scripts/merge-approved-places.ts` walks the approved IDs and
 * emits Place records to merge into the canonical directory.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ENRICHED_PATH = path.join(process.cwd(), "src/data/discovered-enriched.json");
const DECISIONS_PATH = path.join(process.cwd(), "data/discovered-decisions.json");

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

type DecisionsFile = {
  decisions: Record<string, Decision>;
  updated_at: string;
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

export function getDecisions(): Record<string, Decision> {
  return loadDecisions().decisions;
}

export function recordDecision(placeId: string, decision: Decision | "clear"): void {
  const file = loadDecisions();
  if (decision === "clear") delete file.decisions[placeId];
  else file.decisions[placeId] = decision;
  saveDecisions(file);
}

export type ReviewStats = {
  total: number;
  approved: number;
  rejected: number;
  undecided: number;
};

export function getStats(): ReviewStats {
  const candidates = getCandidates();
  const decisions = getDecisions();
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

/** First undecided candidate after the given index (wraps). */
export function nextUndecidedIndex(fromIndex: number): number {
  const candidates = getCandidates();
  const decisions = getDecisions();
  const n = candidates.length;
  if (n === 0) return -1;
  for (let step = 1; step <= n; step++) {
    const i = (fromIndex + step) % n;
    const id = candidates[i].google_place_id;
    if (!decisions[id]) return i;
  }
  return -1;
}
