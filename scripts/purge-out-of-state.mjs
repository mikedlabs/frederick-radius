/**
 * One-off cleanup: remove out-of-state (non-Maryland) records that leaked
 * into the place data + discovery queue. Root cause: discover-places.ts
 * searches a 6km radius around each municipality centroid with no county
 * boundary clip, so border towns (Brunswick/Rosemont, on the Potomac)
 * pulled in places across the state line (Lovettsville VA and other
 * Loudoun/Fairfax towns). build-discovered-places.ts then hardcoded
 * state:"MD", masking them.
 *
 * Predicate: any record whose address/formatted_address carries a
 * "<city>, VA <zip>" state+zip pattern, or an explicit state !== "MD".
 * That pattern is a state+ZIP signature and won't match a Maryland row.
 *
 * Run: node scripts/purge-out-of-state.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = process.cwd();
const STATE_ZIP = /,\s*([A-Z]{2})\s+\d{5}/; // captures the state abbrev

function outOfState(rec) {
  const addr = rec.address ?? rec.formatted_address ?? "";
  const m = STATE_ZIP.exec(addr);
  if (m && m[1] !== "MD") return true;
  if (typeof rec.state === "string" && rec.state.toUpperCase() !== "MD" && rec.state !== "")
    return true;
  return false;
}

// path -> "min" (single-line) | "pretty" (2-space) | "object" (keyed, 2-space)
const FILES = {
  "src/data/places-client.json": "min",
  "src/data/places-discovered.json": "pretty",
  "src/data/discovered-candidates.json": "pretty",
  "src/data/discovered-clean.json": "pretty",
  "src/data/discovered-enriched.json": "pretty",
  "src/data/places-enrichment.json": "object",
};

let grand = 0;
for (const [rel, mode] of Object.entries(FILES)) {
  const path = `${ROOT}/${rel}`;
  const raw = readFileSync(path, "utf8");
  const endsNL = raw.endsWith("\n");
  const data = JSON.parse(raw);

  let removed = 0;
  let out;
  if (mode === "object") {
    out = {};
    for (const [k, v] of Object.entries(data)) {
      if (outOfState(v)) removed++;
      else out[k] = v;
    }
  } else {
    out = data.filter((rec) => {
      const drop = outOfState(rec);
      if (drop) removed++;
      return !drop;
    });
  }

  const serialized =
    mode === "min" ? JSON.stringify(out) : JSON.stringify(out, null, 2);
  writeFileSync(path, serialized + (endsNL ? "\n" : ""));
  grand += removed;
  console.log(`  ${rel.padEnd(38)} removed ${removed}`);
}
console.log(`\n  Total out-of-state records removed: ${grand}`);
