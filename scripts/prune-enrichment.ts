/**
 * Prune orphan enrichment rows — entries whose slug is not in PLACES.
 *
 * The audit found 1,060 dead rows (stale slugs from recompositions);
 * applyEnrichment only ever reads ENRICHMENT[p.slug] for places that
 * exist, so orphans are pure file bloat (12MB → ~half). SAFE: a row is
 * kept iff its slug is a real PLACES slug, so no live place loses its
 * data. Dry-run by default; --write applies. Re-runnable.
 *
 *   npm run prune:enrichment            # report only
 *   npm run prune:enrichment -- --write # rewrite the file
 */
import { writeFileSync } from "node:fs";
import { PLACES } from "@/data/places";
import ENRICH from "@/data/places-enrichment.json" with { type: "json" };

const OUT = new URL("../src/data/places-enrichment.json", import.meta.url).pathname;

function main() {
  const enr = ENRICH as Record<string, unknown>;
  const slugs = new Set(PLACES.map((p) => p.slug));
  const keys = Object.keys(enr);
  const kept: Record<string, unknown> = {};
  let dropped = 0;
  for (const k of keys) {
    if (slugs.has(k)) kept[k] = enr[k];
    else dropped++;
  }
  // Safety invariant: every kept slug is still a real place, and every
  // place that had enrichment keeps it.
  const placesWithEnr = PLACES.filter((p) => enr[p.slug]).length;
  const keptForPlaces = PLACES.filter((p) => kept[p.slug]).length;
  const ok = placesWithEnr === keptForPlaces;

  console.log(`\nenrichment rows ${keys.length} → keep ${Object.keys(kept).length}, drop ${dropped} (orphans)`);
  console.log(`places with enrichment: ${placesWithEnr} → still ${keptForPlaces}  ${ok ? "✓ no place loses data" : "✗ MISMATCH — aborting"}`);

  if (!ok) process.exit(1);

  if (process.argv.includes("--write")) {
    writeFileSync(OUT, JSON.stringify(kept, null, 2) + "\n");
    console.log("wrote pruned src/data/places-enrichment.json\n");
  } else {
    console.log("DRY RUN — re-run with --write to apply.\n");
  }
}

main();
