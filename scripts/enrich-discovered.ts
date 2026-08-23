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
import { readFileSync, writeFileSync } from "node:fs";
import { getPlaceDetails } from "@/lib/integrations/google-places";
import { partitionFrederickCountyRows } from "@/lib/placement-trust";
import {
  createManualGoogleCallBudget,
  googleCostPreview,
  parseManualGoogleRun,
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

const IN = new URL("../src/data/discovered-clean.json", import.meta.url).pathname;
const OUT = new URL("../src/data/discovered-enriched.json", import.meta.url).pathname;

async function main() {
  const run = parseManualGoogleRun(process.argv.slice(2), {
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
  const targets = placement.accepted.slice(0, run.limit);
  const calls = targets.length;

  console.log(`\n  Ingest Phase 2 — enrich ${calls} discovered places`);
  console.log("  --------------------------------------------------");
  console.log(`  Eligible rows         ${placement.accepted.length}`);
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
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log("\n  GOOGLE_PLACES_API_KEY not set. Aborted, $0 spent.\n");
    process.exit(1);
  }

  console.log("\n  LIVE — enriching…");
  const out: Array<Clean & {
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
  }> = [];
  let ok = 0, miss = 0;
  const callBudget = createManualGoogleCallBudget(run.limit);
  for (let i = 0; i < targets.length; i++) {
    if (!callBudget.reserve()) break;
    const c = targets[i];
    const d = await getPlaceDetails(c.google_place_id, "full").catch(() => null);
    if (d) {
      ok++;
      out.push({
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
      out.push({ ...c }); // keep the place; just unenriched
    }
    if ((i + 1) % 100 === 0) console.log(`  …${i + 1}/${targets.length} (ok ${ok}, miss ${miss})`);
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\n  Done. enriched ${ok}, unenriched ${miss}, total ${out.length}.`);
  console.log("  Wrote src/data/discovered-enriched.json (review artifact — NOT merged)\n");
}

main();
