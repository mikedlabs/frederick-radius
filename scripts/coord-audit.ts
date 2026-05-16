/**
 * Curated-vs-DFP coordinate divergence audit.
 *
 * The DFP records are geocoded from authoritative addresses (audit:
 * 0/1280 bad coords). Hand-entered curated records sometimes carry
 * guessed coordinates. When the same business exists in both and the
 * coordinates disagree by a lot, the curated one is almost always the
 * error and renders in the wrong place on the map.
 *
 * This flags same-name pairs whose coordinates diverge beyond a
 * threshold so they can be reviewed and corrected to the geocoded
 * location. Read-only: prints a report, changes nothing.
 *
 * Run: npm run coord:audit
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLACES } from "@/data/places";
import { normName } from "@/lib/dedup";
import { haversineMeters } from "@/lib/geo";

const THRESHOLD_M = 200;

type Row = { name?: string; title?: string; address?: string; city?: string; geom?: { lat: number; lng: number } };
const dfp = JSON.parse(
  readFileSync(resolve("src/data/places-dfp.json"), "utf8"),
) as Row[] | { places?: Row[] };
const dfpRows: Row[] = Array.isArray(dfp) ? dfp : dfp.places ?? [];

const dfpByName = new Map<string, Row>();
for (const r of dfpRows) {
  const nm = normName(r.name ?? r.title ?? "");
  if (nm && r.geom && !dfpByName.has(nm)) dfpByName.set(nm, r);
}

const curated = PLACES.filter((p) => p.source !== "dfp");
const flagged: Array<{
  name: string;
  meters: number;
  curated: string;
  dfp: string;
}> = [];

for (const p of curated) {
  const nm = normName(p.name);
  const d = dfpByName.get(nm);
  if (!d?.geom || !p.geom) continue;
  const meters = Math.round(haversineMeters(p.geom, d.geom));
  if (meters > THRESHOLD_M) {
    flagged.push({
      name: p.name,
      meters,
      curated: `${p.address ?? "?"} (${p.geom.lat.toFixed(5)},${p.geom.lng.toFixed(5)})`,
      dfp: `${d.address ?? "?"} (${d.geom.lat.toFixed(5)},${d.geom.lng.toFixed(5)})`,
    });
  }
}

flagged.sort((a, b) => b.meters - a.meters);

console.log(
  `Compared ${curated.length} curated vs ${dfpByName.size} DFP names. ` +
    `${flagged.length} diverge > ${THRESHOLD_M}m:\n`,
);
for (const f of flagged) {
  console.log(`  ${f.meters} m  ${f.name}`);
  console.log(`     curated: ${f.curated}`);
  console.log(`     DFP:     ${f.dfp}`);
}
