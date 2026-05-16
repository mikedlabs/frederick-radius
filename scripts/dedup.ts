/**
 * Phase 1 deduplication build step. Reads PLACES and optional decisions,
 * runs the pure pipeline in src/lib/dedup.ts, writes
 * src/data/places-dedup.json. The render layer applies it only behind
 * RADIUS_DEDUPE, so the default behavior is unchanged.
 *
 * Run: node --import tsx scripts/dedup.ts
 * Honors src/data/dedup-decisions.json when present:
 *   { "reject": ["slugA|slugB"], "merge": ["slugA|slugB"] }
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { PLACES } from "../src/data/places";
import { buildDedup, type DedupDecisions } from "../src/lib/dedup";

function loadDecisions(): DedupDecisions {
  const path = new URL("../src/data/dedup-decisions.json", import.meta.url).pathname;
  if (!existsSync(path)) return { reject: new Set(), merge: new Set() };
  try {
    const j = JSON.parse(readFileSync(path, "utf8")) as { reject?: string[]; merge?: string[] };
    return { reject: new Set(j.reject ?? []), merge: new Set(j.merge ?? []) };
  } catch {
    return { reject: new Set(), merge: new Set() };
  }
}

const map = buildDedup(PLACES, loadDecisions());
const dropped = Object.entries(map).filter(([s, v]) => v.canonical !== s).length;
const canon = new Set(Object.values(map).map((v) => v.canonical)).size;
writeFileSync(
  new URL("../src/data/places-dedup.json", import.meta.url).pathname,
  JSON.stringify(map, null, 0),
);
console.log(
  `dedup: ${PLACES.length} places, ${canon} duplicate clusters, ${dropped} records fold into a canonical.`,
);
