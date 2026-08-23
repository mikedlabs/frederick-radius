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
 *      • Run resolveAndEnrich({ name, address, lat, lng }, "lean").
 *   2. Accept the match ONLY IF:
 *      • Google's display_name fuzzy-matches our name (token Jaccard
 *        ≥ 0.5 OR one is a prefix of the other), AND
 *      • Google's pin is within 200 m of our stored geom.
 *   3. On accept: write back `google_place_id` = the real ChIJ id.
 *   4. On reject: record in audit/chij-backfill-uncertain.json for
 *      a human review pass.
 *
 * Modes:
 *   default / --dry-run / --plan
 *                No API calls or writes; prints what would be tried. Free.
 *   --live --confirm --limit N
 *                Confirmed paid run with one global request ceiling across
 *                both source files. The immutable per-run maximum is 500.
 *
 * Preview: npm exec tsx scripts/backfill-chij-ids.ts
 * Live: GOOGLE_PLACES_API_KEY=… npm exec tsx scripts/backfill-chij-ids.ts -- --live --confirm --limit 100
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveAndEnrich,
  googlePlacesConfigured,
  type PlaceEnrichment,
} from "@/lib/integrations/google-places";
import {
  createManualGoogleCallBudget,
  googleCostPreview,
  parseManualGoogleRun,
  type ManualGoogleCallBudget,
  type ManualGoogleRun,
} from "./lib/manual-google-run";

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

// A rejected candidate, recorded for the human review pass. Mirrors the
// object pushed in patchFile(); fields are sourced from Row, the failing
// Verdict branch, and the Google candidate (PlaceEnrichment).
type UncertainRecord = {
  slug: string;
  name: string;
  address?: string;
  geom?: { lat: number; lng: number };
  reason: Extract<Verdict, { ok: false }>["reason"];
  google_distance_m?: number;
  google_candidate_id?: PlaceEnrichment["google_place_id"];
  google_candidate_name?: PlaceEnrichment["display_name"];
  google_candidate_address?: PlaceEnrichment["formatted_address"];
};

async function verify(row: Row): Promise<Verdict> {
  if (!row.geom) return { ok: false, reason: "no-geom" };
  if (!isRealAddress(row.address)) return { ok: false, reason: "no-real-address" };
  const enr = await resolveAndEnrich({
    name: row.name,
    address: `${row.address}, Frederick County, MD`,
    lat: row.geom.lat,
    lng: row.geom.lng,
  }, "lean");
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
  run: ManualGoogleRun,
  callBudget: ManualGoogleCallBudget,
): Promise<{ resolved: number; uncertain: UncertainRecord[]; skipped: number; calls: number }> {
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
  const uncertain: UncertainRecord[] = [];

  for (const { r, i } of candidates) {
    const preflight = !r.geom
      ? ({ ok: false, reason: "no-geom" } as const)
      : !isRealAddress(r.address)
        ? ({ ok: false, reason: "no-real-address" } as const)
        : null;
    if (preflight) {
      uncertain.push({
        slug: r.slug,
        name: r.name,
        address: r.address,
        geom: r.geom,
        reason: preflight.reason,
      });
      skipped++;
      continue;
    }

    // This one budget instance is created outside the file loop. A batch can
    // never spend `limit` against each source independently.
    if (!callBudget.reserve()) break;
    if (run.dryRun) {
      skipped++;
      continue;
    }

    // Count the provider attempt before awaiting it. A thrown/network failure
    // still consumed the reserved request and must remain inside the ceiling.
    calls++;
    const verdict = await verify(r);
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

  if (run.live && resolved > 0) {
    const out = pretty
      ? JSON.stringify(rows, null, 2) + (original.endsWith("\n") ? "\n" : "")
      : JSON.stringify(rows);
    writeFileSync(filePath, out);
    console.log(`  ✓ wrote ${resolved} new ChIJ ids back to ${filePath}`);
  }

  return { resolved, uncertain, skipped, calls };
}

async function main() {
  const run = parseManualGoogleRun(process.argv.slice(2), {
    defaultLimit: 100,
    maxLimit: 500,
  });
  const paths = [
    "src/data/places-dfp.json",
    "src/data/places-discovered.json",
  ];
  const callableCandidates = paths.reduce((total, path) => {
    const rows = JSON.parse(readFileSync(resolve(path), "utf8")) as Row[];
    return total + rows.filter(
      (row) =>
        row.google_place_id &&
        !CHIJ_RE.test(row.google_place_id) &&
        row.geom &&
        isRealAddress(row.address),
    ).length;
  }, 0);
  const plannedCalls = Math.min(callableCandidates, run.limit);
  console.log("ChIJ backfill", {
    mode: run.dryRun ? "dry-run" : "live",
    hardRequestCeiling: run.limit,
  });
  console.log(`Callable candidates across both files: ${callableCandidates}`);
  console.log(googleCostPreview({
    calls: plannedCalls,
    pricePerThousandUsd: 35,
    sku: "Text Search Enterprise",
  }));
  if (run.dryRun) {
    console.log("No API calls or files will be changed.");
  } else {
    loadEnvLocal();
    if (!googlePlacesConfigured()) {
      throw new Error("GOOGLE_PLACES_API_KEY missing — aborting, $0 spent.");
    }
  }

  const callBudget = createManualGoogleCallBudget(run.limit);
  const totals = { resolved: 0, uncertain: [] as UncertainRecord[], skipped: 0, calls: 0 };
  for (const path of paths) {
    const r = await patchFile(resolve(path), run, callBudget);
    totals.resolved += r.resolved;
    totals.uncertain.push(...r.uncertain);
    totals.skipped += r.skipped;
    totals.calls += r.calls;
  }

  console.log("\n=== ChIJ backfill summary ===");
  console.log(`Request slots planned/reserved: ${callBudget.used}/${callBudget.limit}`);
  console.log(`API calls made:    ${totals.calls}`);
  console.log(`Resolved + saved:  ${totals.resolved}`);
  console.log(
    `Uncertain:         ${totals.uncertain.length}` +
      (run.live
        ? "  (in audit/chij-backfill-uncertain.json)"
        : "  (preview only; no audit file written)"),
  );
  console.log(`Skipped:           ${totals.skipped}`);

  if (run.live) {
    writeFileSync(
      resolve("audit/chij-backfill-uncertain.json"),
      JSON.stringify(
        {
          generated: new Date().toISOString(),
          mode: "live",
          summary: {
            request_ceiling: callBudget.limit,
            reserved_requests: callBudget.used,
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
  } else {
    console.log(
      "Run with --live --confirm --limit N after reviewing this plan.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
