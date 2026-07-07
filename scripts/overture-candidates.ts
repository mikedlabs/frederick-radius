/**
 * Overture Places gap-fill — REVIEW QUEUE builder (never auto-merges).
 *
 * Two-step, by design (heavy S3 pull stays offline; the diff lives in-repo):
 *
 *   1. Download Overture places for the Frederick County bbox as GeoJSON.
 *      Overture is GeoParquet on S3; the official CLI does the extract:
 *
 *        pipx install overturemaps   # or: pip install overturemaps
 *        overturemaps download \
 *          --bbox=-77.70,39.265,-77.15,39.745 \
 *          -f geojson --type=place \
 *          -o /tmp/overture-frederick.geojson
 *
 *   2. Diff against the curated set and write a review queue:
 *
 *        npm run discover:overture -- --in /tmp/overture-frederick.geojson
 *
 * Output: src/data/overture-candidates.json — places Overture knows that we
 * do NOT, grouped by municipality, sorted so the outer towns (the actual
 * gap) surface first. NOTHING is added to the app; the owner hand-vets the
 * queue, same discipline as scripts/discover-places.ts and the dedupe review.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLACES } from "@/data/places";
import { resolveMunicipality } from "@/lib/connect";
import type { DedupeRecord } from "@/lib/dedupe";
import {
  normalizeOvertureFeature,
  findNewCandidates,
  type OvertureCandidate,
} from "@/lib/overture/candidates";

const BBOX = "-77.70,39.265,-77.15,39.745";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function printHowTo(): void {
  console.log("\nOverture candidate review — no input file given.\n");
  console.log("Step 1 — download Overture places for the county bbox (offline, needs the CLI):");
  console.log("  pipx install overturemaps");
  console.log(
    `  overturemaps download --bbox=${BBOX} -f geojson --type=place -o /tmp/overture-frederick.geojson`,
  );
  console.log("\nStep 2 — diff against the curated set and write the review queue:");
  console.log("  npm run discover:overture -- --in /tmp/overture-frederick.geojson\n");
}

function main(): void {
  const inPath = arg("--in");
  if (!inPath) {
    printHowTo();
    process.exit(0);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolve(inPath), "utf8"));
  } catch (e) {
    console.error(`Could not read/parse ${inPath}: ${(e as Error).message}`);
    process.exit(1);
  }

  const features = (raw as { features?: unknown[] })?.features;
  if (!Array.isArray(features)) {
    console.error("Input is not a GeoJSON FeatureCollection (no features array).");
    process.exit(1);
  }

  // Normalize + county-gate the Overture rows.
  const overture: OvertureCandidate[] = [];
  for (const f of features) {
    const c = normalizeOvertureFeature(f as never);
    if (c) overture.push(c);
  }

  // Curated set as dedupe records.
  const curated: DedupeRecord[] = PLACES.map((p) => ({
    slug: p.slug,
    name: p.name,
    geom: p.geom,
    source: p.source,
    google_place_id: p.google_place_id,
  }));

  const fresh = findNewCandidates(overture, curated);

  // Group by municipality so the outer-town gap is obvious. Frederick city
  // is the big, well-covered set; the towns are where Overture earns its keep.
  const byTown = new Map<string, OvertureCandidate[]>();
  for (const c of fresh) {
    const town = resolveMunicipality({ lng: c.lng, lat: c.lat }).municipality.slug;
    (byTown.get(town) ?? byTown.set(town, []).get(town)!).push(c);
  }

  const groups = [...byTown.entries()]
    .map(([municipality, list]) => ({
      municipality,
      count: list.length,
      candidates: list.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    // Smallest towns first: the outer-town gap is the point, Frederick city last.
    .sort((a, b) => a.count - b.count);

  const out = resolve(process.cwd(), "src/data/overture-candidates.json");
  writeFileSync(
    out,
    JSON.stringify(
      { generatedFromBbox: BBOX, totalScanned: overture.length, totalNew: fresh.length, groups },
      null,
      2,
    ),
  );

  console.log(`\nOverture candidate review:`);
  console.log(`  Scanned (in county) : ${overture.length}`);
  console.log(`  Already curated     : ${overture.length - fresh.length}`);
  console.log(`  NEW candidates      : ${fresh.length}`);
  console.log(`  By town (gap first) :`);
  for (const g of groups) console.log(`     ${g.municipality.padEnd(16)} ${g.count}`);
  console.log(`\n  Wrote src/data/overture-candidates.json`);
  console.log(`  REVIEW required before any merge. No app data was mutated.\n`);
}

main();
