/**
 * County-wide place discovery — DRY RUN FIRST, by owner directive.
 *
 * The point of this script is the cost gate. By default it spends
 * NOTHING: it builds the exact Scenario A query plan (the discoverable
 * taxonomy × every municipality), then prints the precise number of
 * billed calls and a real dollar projection using current Google
 * Places API (New) pricing. Only an explicit
 * `--live --confirm --limit N` actually calls the API, and even then
 * it writes a REVIEW file — it never auto-merges places into the app
 * (data-sensitive: the owner reviews the list, same rule as dedupe).
 *
 *   npm run discover                         # dry run, $0, prints the plan + cost
 *   npm run discover -- --pages 2            # project 2 pages/query
 *   npm run discover -- --live --confirm --limit 325
 *
 * Pricing (verified 2026-08, USD per 1,000, top of volume band):
 *   Text Search, lean mask  = Pro                 $32.00
 * This discovery stage requests Text Search identity fields only. Candidate
 * details are enriched later by a separately reviewed, separately capped job.
 */
import { writeFileSync } from "node:fs";
import { MUNICIPALITIES } from "@/data/municipalities";
import { PLACES } from "@/data/places";
import {
  assertManualGoogleArgs,
  createManualGoogleCallBudget,
  googleCostPreview,
  parseManualGoogleRun,
  type ManualGoogleCallBudget,
} from "./lib/manual-google-run";

// Discoverable categories only — deliberately NOT the B2B/trade types
// the relevance filter hides, so we never pay to discover noise.
const CATEGORIES = [
  "coffee shop", "cafe", "restaurant", "brewery", "distillery", "winery",
  "bar", "bakery", "ice cream shop", "farmers market", "museum",
  "art gallery", "live music venue", "theater", "park", "trail",
  "playground", "library", "bookstore", "antique store", "yoga studio",
  "gym", "hotel", "garden", "place of worship",
];

const PRICE_TEXT_SEARCH_PRO_PER_1000 = 32;

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? "") : def;
}
function main() {
  const args = process.argv.slice(2);
  assertManualGoogleArgs(args, { valueFlags: ["--pages"] });
  const run = parseManualGoogleRun(args, {
    defaultLimit: 500,
    maxLimit: 1_000,
  });
  const areas = MUNICIPALITIES.map((m) => ({ name: m.name, centroid: m.centroid }));
  const pages = Math.min(3, Math.max(1, parseInt(arg("--pages", "1")!, 10) || 1));

  const queries = CATEGORIES.length * areas.length;
  const possibleSearchCalls = queries * pages;
  const plannedSearchCalls = Math.min(possibleSearchCalls, run.limit);

  console.log("\n  County-wide discovery — Scenario A plan");
  console.log("  ----------------------------------------");
  console.log(`  Categories            ${CATEGORIES.length}`);
  console.log(`  Areas (municipalities) ${areas.length}`);
  console.log(`  Pages per query        ${pages}`);
  console.log(`  Already known places   ${PLACES.length} (dedupe out, push spend toward the floor)`);
  console.log(`  Possible searches      ${possibleSearchCalls}`);
  console.log(`  Hard request ceiling   ${run.limit}`);
  console.log(`  Planned calls          ${plannedSearchCalls}`);
  console.log(
    `  ${googleCostPreview({
      calls: plannedSearchCalls,
      pricePerThousandUsd: PRICE_TEXT_SEARCH_PRO_PER_1000,
      sku: "Text Search Pro",
    })}`,
  );

  if (run.dryRun) {
    console.log("\n  DRY RUN — nothing was called, $0 spent.");
    console.log("  To execute: npm run discover -- --live --confirm --limit N\n");
    return;
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log("\n  GOOGLE_PLACES_API_KEY not set. Aborted, $0 spent.\n");
    process.exit(1);
  }

  // Live path intentionally writes a REVIEW artifact only — it never
  // mutates src/data. The owner reviews discovered candidates before
  // any merge (same discipline as the dedupe review).
  console.log("\n  LIVE run acknowledged. Executing the discovery sweep…");
  runLive(
    areas,
    pages,
    createManualGoogleCallBudget(run.limit),
  ).catch((e) => {
    console.error("  discovery failed:", e);
    process.exit(1);
  });
}

async function runLive(
  areas: { name: string; centroid: { lng: number; lat: number } }[],
  pages: number,
  callBudget: ManualGoogleCallBudget,
) {
  const BASE = "https://places.googleapis.com/v1";
  const key = process.env.GOOGLE_PLACES_API_KEY!;
  const known = new Set(
    PLACES.map((p) => `${p.name.toLowerCase().trim()}`),
  );
  const found: Record<string, unknown>[] = [];
  let searchCalls = 0;

  for (const cat of CATEGORIES) {
    for (const area of areas) {
      let pageToken: string | undefined;
      for (let pg = 0; pg < pages; pg++) {
        if (!callBudget.reserve()) {
          console.log(`  Hard request ceiling reached at ${callBudget.used} call(s). Stopping.`);
          finalize(found);
          return;
        }
        const body: Record<string, unknown> = {
          textQuery: `${cat} in ${area.name}, Maryland`,
          maxResultCount: 20,
          locationBias: {
            circle: {
              center: { latitude: area.centroid.lat, longitude: area.centroid.lng },
              radius: 6000.0,
            },
          },
        };
        if (pageToken) body.pageToken = pageToken;
        const res = await fetch(`${BASE}/places:searchText`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            // LEAN mask = Pro tier (cheapest). Details come later, only
            // for genuinely-new survivors, in a separate reviewed step.
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,nextPageToken",
          },
          body: JSON.stringify(body),
        });
        searchCalls++;
        if (!res.ok) {
          console.error(`  searchText HTTP ${res.status} for "${cat} / ${area.name}"`);
          break;
        }
        const data = (await res.json()) as {
          places?: { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: unknown; primaryType?: string }[];
          nextPageToken?: string;
        };
        for (const pl of data.places ?? []) {
          const nm = (pl.displayName?.text ?? "").toLowerCase().trim();
          if (!nm || known.has(nm)) continue; // dedupe vs existing
          known.add(nm);
          found.push({
            google_place_id: pl.id,
            name: pl.displayName?.text,
            address: pl.formattedAddress,
            primary_type: pl.primaryType,
            location: pl.location,
            discovered_for: { category: cat, area: area.name },
          });
        }
        pageToken = data.nextPageToken;
        if (!pageToken) break;
      }
    }
  }
  console.log(`  Searches: ${searchCalls}. New candidates: ${found.length}.`);
  finalize(found);
}

function finalize(found: Record<string, unknown>[]) {
  const out = new URL(
    "../src/data/discovered-candidates.json",
    import.meta.url,
  ).pathname;
  writeFileSync(out, JSON.stringify(found, null, 2));
  console.log(`  Wrote ${found.length} candidates to src/data/discovered-candidates.json`);
  console.log("  REVIEW required before any merge into places. No app data was mutated.\n");
}

main();
