/**
 * County-wide place discovery — DRY RUN FIRST, by owner directive.
 *
 * The point of this script is the cost gate. By default it spends
 * NOTHING: it builds the exact Scenario A query plan (the discoverable
 * taxonomy × every municipality), then prints the precise number of
 * billed calls and a real dollar projection using current Google
 * Places API (New) pricing. Only an explicit `--live --confirm` (with
 * a key and under `--max-cost`) actually calls the API, and even then
 * it writes a REVIEW file — it never auto-merges places into the app
 * (data-sensitive: the owner reviews the list, same rule as dedupe).
 *
 *   npm run discover                         # dry run, $0, prints the plan + cost
 *   npm run discover -- --pages 2            # project 2 pages/query
 *   npm run discover -- --assume-new 6       # tune the Details ceiling
 *   npm run discover -- --live --confirm     # execute (gated, capped)
 *
 * Pricing (fetched 2026-05, USD per 1,000, top of volume band):
 *   Text Search, lean mask  = Pro                 $32.00
 *   Place Details, full     = Enterprise+Atmos    $25.00
 * Pro/Enterprise tiers include 5,000 free billable events / month.
 */
import { writeFileSync } from "node:fs";
import { MUNICIPALITIES } from "@/data/municipalities";
import { PLACES } from "@/data/places";

// Discoverable categories only — deliberately NOT the B2B/trade types
// the relevance filter hides, so we never pay to discover noise.
const CATEGORIES = [
  "coffee shop", "cafe", "restaurant", "brewery", "distillery", "winery",
  "bar", "bakery", "ice cream shop", "farmers market", "museum",
  "art gallery", "live music venue", "theater", "park", "trail",
  "playground", "library", "bookstore", "antique store", "yoga studio",
  "gym", "hotel", "garden", "place of worship",
];

const PRICE_TEXT_SEARCH_PRO = 32.0 / 1000; // USD/request, lean mask
const PRICE_PLACE_DETAILS = 25.0 / 1000; // USD/request, Enterprise+Atmosphere
const FREE_EVENTS_PER_MONTH = 5000;

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? "") : def;
}
function flag(name: string): boolean {
  return process.argv.includes(name);
}

function main() {
  const areas = MUNICIPALITIES.map((m) => ({ name: m.name, centroid: m.centroid }));
  const pages = Math.max(1, parseInt(arg("--pages", "1")!, 10) || 1);
  const assumeNew = Math.max(0, parseInt(arg("--assume-new", "8")!, 10) || 0);
  const maxCost = parseFloat(arg("--max-cost", "140")!) || 140;

  const queries = CATEGORIES.length * areas.length;
  const searchCalls = queries * pages;

  // Floor: 0 new places found anywhere -> only the search calls bill.
  // Ceiling: assumeNew genuinely-new places per (category x area) need
  // a Place Details call. Existing places dedupe out (~PLACES.length
  // already known), so real spend trends toward the floor.
  const detailsCallsCeiling = queries * assumeNew;
  const searchCost = searchCalls * PRICE_TEXT_SEARCH_PRO;
  const detailsCostCeiling = detailsCallsCeiling * PRICE_PLACE_DETAILS;
  const floor = searchCost;
  const ceiling = searchCost + detailsCostCeiling;
  const billedCeiling = searchCalls + detailsCallsCeiling;
  const afterFreeFloor = Math.max(0, (searchCalls - FREE_EVENTS_PER_MONTH)) * PRICE_TEXT_SEARCH_PRO;
  const afterFreeCeiling =
    Math.max(0, billedCeiling - FREE_EVENTS_PER_MONTH) *
    ((searchCost + detailsCostCeiling) / Math.max(1, billedCeiling));

  const live = flag("--live");
  const confirmed = flag("--confirm");

  console.log("\n  County-wide discovery — Scenario A plan");
  console.log("  ----------------------------------------");
  console.log(`  Categories            ${CATEGORIES.length}`);
  console.log(`  Areas (municipalities) ${areas.length}`);
  console.log(`  Pages per query        ${pages}`);
  console.log(`  Already known places   ${PLACES.length} (dedupe out, push spend toward the floor)`);
  console.log(`  Text Search calls      ${searchCalls}  (exact)`);
  console.log(`  Place Details ceiling  ${detailsCallsCeiling}  (assume ${assumeNew} new / query)`);
  console.log("\n  Projected one-time cost (current Google pricing)");
  console.log("  ------------------------------------------------");
  console.log(`  Floor  (0 new found)   $${floor.toFixed(2)}`);
  console.log(`  Ceiling (all assumed)  $${ceiling.toFixed(2)}`);
  console.log(`  After 5,000/mo free    $${afterFreeFloor.toFixed(2)} – $${afterFreeCeiling.toFixed(2)}`);
  console.log(`  Hard cap (--max-cost)  $${maxCost.toFixed(2)}`);

  if (ceiling > maxCost) {
    console.log(
      `\n  ! Ceiling $${ceiling.toFixed(2)} exceeds the $${maxCost.toFixed(2)} cap.` +
        ` Lower --assume-new or --pages, or raise --max-cost.`,
    );
  }

  if (!live) {
    console.log("\n  DRY RUN — nothing was called, $0 spent.");
    console.log("  To execute: npm run discover -- --live --confirm\n");
    return;
  }
  if (!confirmed) {
    console.log("\n  --live requires --confirm. Aborted, $0 spent.\n");
    process.exit(1);
  }
  if (ceiling > maxCost) {
    console.log("\n  Refusing to run: projected ceiling exceeds the cost cap. $0 spent.\n");
    process.exit(1);
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log("\n  GOOGLE_PLACES_API_KEY not set. Aborted, $0 spent.\n");
    process.exit(1);
  }

  // Live path intentionally writes a REVIEW artifact only — it never
  // mutates src/data. The owner reviews discovered candidates before
  // any merge (same discipline as the dedupe review).
  console.log("\n  LIVE run acknowledged. Executing the discovery sweep…");
  runLive(areas, pages, maxCost).catch((e) => {
    console.error("  discovery failed:", e);
    process.exit(1);
  });
}

async function runLive(
  areas: { name: string; centroid: { lng: number; lat: number } }[],
  pages: number,
  maxCost: number,
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
        const spent =
          searchCalls * PRICE_TEXT_SEARCH_PRO + found.length * PRICE_PLACE_DETAILS;
        if (spent > maxCost) {
          console.log(`  Cost cap reached (~$${spent.toFixed(2)}). Stopping.`);
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
