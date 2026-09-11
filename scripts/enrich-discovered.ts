/**
 * Ingest Phase 2 — enrich the 1,060 clean discovered places via Google
 * Place Details (by place_id = the cheapest path). DRY RUN FIRST.
 *
 * Default: $0, no calls — prints the exact projected cost. Only
 * `--live --confirm --limit N` actually calls. Writes
 * src/data/discovered-enriched.json (review artifact for Phase 3);
 * mutates nothing in the app.
 *
 *   npm run enrich:discovered                 # dry run, $0
 *   npm run enrich:discovered -- --live --confirm --limit 500
 *
 * Pricing (2026-08): Place Details, our full field mask = Enterprise +
 * Atmosphere $25.00 / 1,000, with 1,000 free requests per month
 * (discovery used ~300).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getPlaceDetails } from "@/lib/integrations/google-places";
import { partitionFrederickCountyRows } from "@/lib/placement-trust";
import {
  assertManualGoogleArgs,
  createManualGoogleCallBudget,
  googleCostPreview,
  parseManualGoogleRun,
  selectRotatingManualBatch,
} from "./lib/manual-google-run";

type Clean = {
  google_place_id: string;
  name: string;
  address?: string;
  primary_type?: string;
  lat: number;
  lng: number;
  municipality: string;
};

type Enriched = Clean & {
  business_status?: string;
  weekday_hours?: string[];
  has_hours?: boolean;
  rating?: number;
  user_rating_count?: number;
  photo_names?: string[];
  phone?: string;
  website?: string;
  detail_primary_type?: string;
  editorial_summary?: string;
  review_snippet?: string;
  review_author?: string;
};

function hasMaterialEnrichment(row: Enriched | undefined): boolean {
  return Boolean(
    row &&
      (row.business_status ||
        row.weekday_hours?.length ||
        row.photo_names?.length ||
        row.phone ||
        row.website ||
        row.detail_primary_type ||
        row.editorial_summary ||
        row.review_snippet),
  );
}

const IN = new URL("../src/data/discovered-clean.json", import.meta.url).pathname;
const OUT = new URL("../src/data/discovered-enriched.json", import.meta.url).pathname;

async function main() {
  const args = process.argv.slice(2);
  assertManualGoogleArgs(args);
  const run = parseManualGoogleRun(args, {
    defaultLimit: 100,
    maxLimit: 1_500,
  });
  const clean = JSON.parse(readFileSync(IN, "utf8")) as Clean[];
  // A stale or hand-edited Phase 1 artifact must not turn into paid calls.
  // Partition before the cost projection and retain the source file unchanged.
  const placement = partitionFrederickCountyRows(clean, (row) => ({
    lng: row.lng,
    lat: row.lat,
  }));
  const existing = existsSync(OUT)
    ? (JSON.parse(readFileSync(OUT, "utf8")) as Enriched[])
    : [];
  const existingById = new Map(
    existing.map((row) => [row.google_place_id, row] as const),
  );
  const unfinished = placement.accepted.filter(
    (row) => !hasMaterialEnrichment(existingById.get(row.google_place_id)),
  );
  const now = new Date();
  const cycle = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const selection = selectRotatingManualBatch(unfinished, run.limit, cycle);
  const targets = selection.items;
  const calls = targets.length;

  console.log(`\n  Ingest Phase 2 — enrich ${calls} discovered places`);
  console.log("  --------------------------------------------------");
  console.log(`  Eligible rows         ${placement.accepted.length}`);
  console.log(`  Already enriched      ${placement.accepted.length - unfinished.length}`);
  console.log(`  Remaining             ${unfinished.length}`);
  console.log(`  Monthly rotation      offset ${selection.offset}`);
  console.log(`  Place Details calls   ${calls} (by place_id, exact)`);
  console.log(`  Hard request ceiling  ${run.limit}`);
  console.log(
    `  ${googleCostPreview({
      calls,
      pricePerThousandUsd: 25,
      sku: "Place Details Enterprise + Atmosphere",
    })}`,
  );
  if (placement.rejected.length > 0) {
    console.log(
      `  Placement rejects     ${placement.rejected.length} (retained in discovered-clean.json; no paid call)`,
    );
  }

  if (run.dryRun) {
    console.log("\n  DRY RUN — nothing called, $0 spent.");
    console.log("  To execute: npm run enrich:discovered -- --live --confirm --limit N\n");
    return;
  }
  if (targets.length === 0) {
    console.log("\n  Nothing remains in this reviewed enrichment scope.\n");
    return;
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log("\n  GOOGLE_PLACES_API_KEY not set. Aborted, $0 spent.\n");
    process.exit(1);
  }

  console.log("\n  LIVE — enriching…");
  // Merge into the full review artifact. A capped batch must never replace a
  // thousand-row artifact with only the rows purchased in this run.
  const mergedById = new Map(existingById);
  const orderedIds = existing.map((row) => row.google_place_id);
  for (const row of placement.accepted) {
    if (!mergedById.has(row.google_place_id)) {
      mergedById.set(row.google_place_id, row);
      orderedIds.push(row.google_place_id);
    }
  }
  let ok = 0, miss = 0;
  const callBudget = createManualGoogleCallBudget(run.limit);
  for (let i = 0; i < targets.length; i++) {
    if (!callBudget.reserve()) break;
    const c = targets[i];
    const d = await getPlaceDetails(c.google_place_id, "full").catch(() => null);
    if (d) {
      ok++;
      mergedById.set(c.google_place_id, {
        ...c,
        business_status: d.business_status,
        weekday_hours: d.weekday_hours,
        has_hours: d.has_hours,
        rating: d.rating,
        user_rating_count: d.user_rating_count,
        photo_names: d.photo_names,
        phone: d.phone,
        website: d.website,
        detail_primary_type: d.primary_type,
        editorial_summary: d.editorial_summary,
        review_snippet: d.review_snippet,
        review_author: d.review_author,
      });
    } else {
      miss++;
      // Keep any prior row. A transient miss must not erase data we already
      // paid to obtain; a first miss remains as the clean base row.
      if (!mergedById.has(c.google_place_id)) {
        mergedById.set(c.google_place_id, c);
        orderedIds.push(c.google_place_id);
      }
    }
    if ((i + 1) % 100 === 0) console.log(`  …${i + 1}/${targets.length} (ok ${ok}, miss ${miss})`);
  }
  const seen = new Set<string>();
  const out = orderedIds.flatMap((id) => {
    if (seen.has(id)) return [];
    seen.add(id);
    const row = mergedById.get(id);
    return row ? [row] : [];
  });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\n  Done. enriched ${ok}, unavailable ${miss}, full artifact ${out.length}.`);
  console.log("  Wrote src/data/discovered-enriched.json (review artifact — NOT merged)\n");
}

main();
