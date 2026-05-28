/**
 * backfill-chij-ids.ts — resolve real Google ChIJ IDs for the ~1,200
 * records currently carrying UUID placeholders in `google_place_id`.
 *
 * Why: 95 % of DFP + discovered records have UUID placeholders rather
 * than real `ChIJ…` IDs. Without real IDs, every audit (closure sweep,
 * hours refresh, photo refresh) has to fall back to fuzzy Text Search
 * and the existing `npm run refresh:business-status` cron is a no-op
 * on the bulk of the catalog. This pass closes that gap.
 *
 * Method (conservative — false negatives are fine, false positives are
 * NOT — a wrong ChIJ poisons every downstream enrichment for that slug):
 *
 *   1. For each record where `google_place_id` is NOT in ChIJ form:
 *      • Skip if no real address (e.g. just "Frederick").
 *      • Run resolveAndEnrich({ name, address, lat, lng }).
 *   2. Accept the match ONLY IF:
 *      • Google's display_name fuzzy-matches our name (token Jaccard
 *        ≥ 0.5 OR one is a prefix of the other), AND
 *      • Google's pin is within 200 m of our stored geom.
 *   3. On accept: write back `google_place_id` = the real ChIJ id.
 *   4. On reject: record in audit/chij-backfill-uncertain.json for
 *      a human review pass.
 *
 * Modes:
 *   --dry-run    No API calls; prints what would be tried. Free.
 *   --plan       1 API call to confirm credentials work, then plan-only.
 *   --run        Live run. Costs Google Places API budget.
 *   --limit N    Only process the first N candidates (for sampling).
 *
 * Run: GOOGLE_PLACES_API_KEY=… npm exec tsx scripts/backfill-chij-ids.ts -- --dry-run
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveAndEnrich,
  googlePlacesConfigured,
  type PlaceEnrichment,
} from "@/lib/integrations/google-places";

// ── env: best-effort .env.local loader so the script runs with a
//        plain `tsx` invocation ──────────────────────────────────────
function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(".env.local"), "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* best-effort */
  }
}
loadEnvLocal();

// ── flags ─────────────────────────────────────────────────────────
const argv = new Set(process.argv.slice(2));
const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DRY = argv.has("--dry-run");
const PLAN = argv.has("--plan");
const RUN = argv.has("--run");
const LIMIT = Number(arg("--limit") ?? Infinity);

if (!DRY && !PLAN && !RUN) {
  console.error(
    "Pick a mode: --dry-run (free), --plan (1 call), or --run (live).",
  );
  process.exit(1);
}

const CHIJ_RE = /^ChIJ[A-Za-z0-9_-]+$/;
const ACCEPT_DISTANCE_M = 200;
const ACCEPT_NAME_JACCARD = 0.5;

type Row = {
  slug: string;
  name: string;
  address?: string;
  postal_code?: string;
  geom?: { lat: number; lng: number };
  google_place_id?: string;
};

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function normName(n?: string): string {
  return (n ?? "")
    .toLowerCase()
    .replace(/[’'&]/g, "")
    .replace(/\b(the|llc|inc|co|corp|ltd|pa)\b/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatches(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.startsWith(nb) || nb.startsWith(na)) return true;
  const ta = new Set(na.split(" ").filter((t) => t.length > 1));
  const tb = new Set(nb.split(" ").filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jaccard = inter / (ta.size + tb.size - inter);
  return jaccard >= ACCEPT_NAME_JACCARD;
}

function isRealAddress(addr?: string): boolean {
  if (!addr) return false;
  // A real US address starts with a street number.
  return /\d/.test(addr) && addr.trim().length > 4;
}

type Verdict =
  | { ok: true; chij: string; distance_m: number; display_name?: string }
  | {
      ok: false;
      reason:
        | "no-google-result"
        | "name-mismatch"
        | "too-far"
        | "no-real-address"
        | "no-geom";
      detail?: string;
      candidate?: PlaceEnrichment;
      distance_m?: number;
    };

async function verify(row: Row): Promise<Verdict> {
  if (!row.geom) return { ok: false, reason: "no-geom" };
  if (!isRealAddress(row.address)) return { ok: false, reason: "no-real-address" };
  const enr = await resolveAndEnrich({
    name: row.name,
    address: `${row.address}, Frederick County, MD`,
    lat: row.geom.lat,
    lng: row.geom.lng,
  });
  if (!enr || !enr.google_place_id) return { ok: false, reason: "no-google-result" };
  const distance =
    enr.lat != null && enr.lng != null
      ? haversineMeters(row.geom, { lat: enr.lat, lng: enr.lng })
      : Infinity;
  if (distance > ACCEPT_DISTANCE_M) {
    return { ok: false, reason: "too-far", candidate: enr, distance_m: distance };
  }
  if (!nameMatches(row.name, enr.display_name ?? "")) {
    return {
      ok: false,
      reason: "name-mismatch",
      candidate: enr,
      distance_m: distance,
    };
  }
  return {
    ok: true,
    chij: enr.google_place_id,
    distance_m: distance,
    display_name: enr.display_name,
  };
}

function detectPretty(text: string): boolean {
  return /^\[\s*\n\s+\{/.test(text);
}

async function patchFile(
  filePath: string,
  ranOnce: { done: boolean },
): Promise<{ resolved: number; uncertain: any[]; skipped: number; calls: number }> {
  const original = readFileSync(filePath, "utf8");
  const pretty = detectPretty(original);
  const rows = JSON.parse(original) as Row[];
  const candidates = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.google_place_id && !CHIJ_RE.test(r.google_place_id));
  console.log(
    `\n→ ${filePath.split("/").pop()}: ${candidates.length} candidates with non-ChIJ google_place_id`,
  );

  let resolved = 0;
  let skipped = 0;
  let calls = 0;
  const uncertain: any[] = [];

  for (const { r, i } of candidates) {
    // Sample-mode cap covers BOTH files combined.
    if (resolved + uncertain.length + skipped + (LIMIT === Infinity ? 0 : 0) >= LIMIT) break;
    if (PLAN && ranOnce.done) {
      // Plan mode: 1 API call total across the run.
      skipped++;
      continue;
    }
    if (DRY) {
      // No API call; just count what we would have tried.
      skipped++;
      continue;
    }
    const verdict = await verify(r);
    calls++;
    ranOnce.done = true;
    if (verdict.ok) {
      rows[i] = { ...r, google_place_id: verdict.chij };
      resolved++;
      if (resolved % 25 === 0) {
        console.log(`  … ${resolved} resolved so far`);
      }
    } else {
      uncertain.push({
        slug: r.slug,
        name: r.name,
        address: r.address,
        geom: r.geom,
        reason: verdict.reason,
        google_distance_m: verdict.distance_m,
        google_candidate_id: verdict.candidate?.google_place_id,
        google_candidate_name: verdict.candidate?.display_name,
        google_candidate_address: verdict.candidate?.formatted_address,
      });
    }
  }

  if (RUN && resolved > 0) {
    const out = pretty
      ? JSON.stringify(rows, null, 2) + (original.endsWith("\n") ? "\n" : "")
      : JSON.stringify(rows);
    writeFileSync(filePath, out);
    console.log(`  ✓ wrote ${resolved} new ChIJ ids back to ${filePath}`);
  }

  return { resolved, uncertain, skipped, calls };
}

async function main() {
  if ((PLAN || RUN) && !googlePlacesConfigured()) {
    console.error("GOOGLE_PLACES_API_KEY missing — aborting.");
    process.exit(1);
  }
  console.log("ChIJ backfill", {
    mode: DRY ? "dry-run" : PLAN ? "plan" : "run",
    limit: LIMIT === Infinity ? "(none)" : LIMIT,
  });

  const ranOnce = { done: false };
  const totals = { resolved: 0, uncertain: [] as any[], skipped: 0, calls: 0 };
  for (const path of [
    "src/data/places-dfp.json",
    "src/data/places-discovered.json",
  ]) {
    const r = await patchFile(resolve(path), ranOnce);
    totals.resolved += r.resolved;
    totals.uncertain.push(...r.uncertain);
    totals.skipped += r.skipped;
    totals.calls += r.calls;
  }

  console.log("\n=== ChIJ backfill summary ===");
  console.log(`API calls made:    ${totals.calls}`);
  console.log(`Resolved + saved:  ${totals.resolved}`);
  console.log(`Uncertain:         ${totals.uncertain.length}  (in audit/chij-backfill-uncertain.json)`);
  console.log(`Skipped:           ${totals.skipped}`);

  writeFileSync(
    resolve("audit/chij-backfill-uncertain.json"),
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        mode: DRY ? "dry-run" : PLAN ? "plan" : "run",
        summary: {
          api_calls: totals.calls,
          resolved: totals.resolved,
          uncertain: totals.uncertain.length,
          skipped: totals.skipped,
        },
        uncertain: totals.uncertain,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
