/**
 * Ingest Phase 2 — enrich the 1,060 clean discovered places via Google
 * Place Details (by place_id = the cheapest path). DRY RUN FIRST.
 *
 * Default: $0, no calls — prints the exact projected cost. Only
 * `--live --confirm` (under --max-cost) actually calls. Writes
 * src/data/discovered-enriched.json (review artifact for Phase 3);
 * mutates nothing in the app.
 *
 *   npm run enrich:discovered                 # dry run, $0
 *   npm run enrich:discovered -- --live --confirm
 *
 * Pricing (2026-05): Place Details, our field mask = Enterprise+
 * Atmosphere $25.00 / 1,000. Pro/Enterprise tiers include 5,000 free
 * billable events / month (discovery used ~300).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getPlaceDetails } from "@/lib/integrations/google-places";

type Clean = {
  google_place_id: string;
  name: string;
  address?: string;
  primary_type?: string;
  lat: number;
  lng: number;
  municipality: string;
};

const PRICE_DETAILS = 25.0 / 1000;
const FREE_EVENTS = 5000;
const IN = new URL("../src/data/discovered-clean.json", import.meta.url).pathname;
const OUT = new URL("../src/data/discovered-enriched.json", import.meta.url).pathname;

const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? (process.argv[i + 1] ?? "") : d;
};
const flag = (n: string) => process.argv.includes(n);

async function main() {
  const clean = JSON.parse(readFileSync(IN, "utf8")) as Clean[];
  const calls = clean.length;
  const listCost = calls * PRICE_DETAILS;
  const afterFree = Math.max(0, calls - FREE_EVENTS) * PRICE_DETAILS;
  const maxCost = parseFloat(arg("--max-cost", "60")!) || 60;

  console.log(`\n  Ingest Phase 2 — enrich ${calls} discovered places`);
  console.log("  --------------------------------------------------");
  console.log(`  Place Details calls   ${calls} (by place_id, exact)`);
  console.log(`  List cost             $${listCost.toFixed(2)}`);
  console.log(`  After 5,000/mo free   $${afterFree.toFixed(2)}`);
  console.log(`  Hard cap (--max-cost) $${maxCost.toFixed(2)}`);

  const live = flag("--live");
  if (!live) {
    console.log("\n  DRY RUN — nothing called, $0 spent.");
    console.log("  To execute: npm run enrich:discovered -- --live --confirm\n");
    return;
  }
  if (!flag("--confirm")) {
    console.log("\n  --live requires --confirm. Aborted, $0 spent.\n");
    process.exit(1);
  }
  if (listCost > maxCost) {
    console.log(`\n  Refusing: list cost $${listCost.toFixed(2)} exceeds cap. $0 spent.\n`);
    process.exit(1);
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
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    const d = await getPlaceDetails(c.google_place_id).catch(() => null);
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
    if ((i + 1) % 100 === 0) console.log(`  …${i + 1}/${clean.length} (ok ${ok}, miss ${miss})`);
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\n  Done. enriched ${ok}, unenriched ${miss}, total ${out.length}.`);
  console.log("  Wrote src/data/discovered-enriched.json (review artifact — NOT merged)\n");
}

main();
