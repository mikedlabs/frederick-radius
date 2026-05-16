/**
 * Curated-vs-DFP coordinate divergence audit (CLI report).
 *
 * Thin wrapper over the shared pure check in src/lib/coord-audit.ts so
 * the script and the data-health cron stay identical. Read-only.
 *
 * Run: npm run coord:audit
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLACES } from "@/data/places";
import { auditCoordDivergence, type CoordAuditPlace } from "@/lib/coord-audit";

const THRESHOLD_M = 200;

type Row = {
  name?: string;
  title?: string;
  address?: string;
  geom?: { lat: number; lng: number };
};
const dfp = JSON.parse(
  readFileSync(resolve("src/data/places-dfp.json"), "utf8"),
) as Row[] | { places?: Row[] };
const dfpRows: Row[] = Array.isArray(dfp) ? dfp : dfp.places ?? [];

const authoritative: CoordAuditPlace[] = dfpRows.map((r) => ({
  name: r.name ?? r.title ?? "",
  address: r.address,
  geom: r.geom,
}));
const curated: CoordAuditPlace[] = PLACES.filter((p) => p.source !== "dfp").map(
  (p) => ({ name: p.name, address: p.address, geom: p.geom }),
);

const flagged = auditCoordDivergence(curated, authoritative, THRESHOLD_M);

console.log(
  `Compared ${curated.length} curated vs ${authoritative.length} DFP names. ` +
    `${flagged.length} diverge > ${THRESHOLD_M}m:\n`,
);
for (const f of flagged) {
  console.log(`  ${f.meters} m  ${f.name}`);
  console.log(`     curated: ${f.curated.address ?? "?"} (${f.curated.lat.toFixed(5)},${f.curated.lng.toFixed(5)})`);
  console.log(`     DFP:     ${f.authoritative.address ?? "?"} (${f.authoritative.lat.toFixed(5)},${f.authoritative.lng.toFixed(5)})`);
}
