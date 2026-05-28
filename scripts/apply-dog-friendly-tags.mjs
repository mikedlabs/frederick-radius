#!/usr/bin/env node
/**
 * Apply `dog-friendly` amenity tag to records that are dog-friendly by
 * default in Frederick, MD:
 *
 *   - All parks (Maryland public parks permit leashed dogs by default)
 *   - All trails
 *   - All breweries (Frederick's brewery scene is well-known for being
 *     dog-friendly outside; the seven curated breweries already carry
 *     the tag, this extends the same default to the discovered set)
 *
 * Excludes a small list of records that share `category: park` but
 * aren't really physical parks (foundations, standalone art pieces,
 * memorial-only entries with no public ground to walk a dog on).
 *
 * Touches src/data/places-dfp.json + src/data/places-discovered.json
 * (where most park/trail/brewery records live). The curated
 * `src/data/places.ts` seed is left alone — the major curated parks
 * already carry the tag.
 *
 * Idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TARGET_CATEGORIES = new Set(["park", "trail", "brewery"]);

// Records that have category=park but aren't a place a dog can be at.
// Conservative — only includes the unambiguous ones from a manual skim
// of all 132 discovered + 9 DFP park records. Memorial entries are
// kept (a leashed dog at a monument is fine).
const EXCLUDE_SLUGS = new Set([
  "francis-scott-key-memorial-foundation", // foundation/org, not a park
  "sailing-through-the-winter-solstice", // a one-night art installation
]);

function patch(filePath) {
  const original = readFileSync(filePath, "utf8");
  const rows = JSON.parse(original);
  // Detect format: pretty-printed if the file contains "\n  " near
  // the start (indented), otherwise compact. Preserve it on write so
  // these patches don't produce huge diffs from re-formatting.
  const pretty = /^\[\s*\n\s+\{/.test(original);
  let tagged = 0;
  let skipped = 0;
  let alreadyTagged = 0;
  for (const r of rows) {
    if (!TARGET_CATEGORIES.has(r.category)) continue;
    if (EXCLUDE_SLUGS.has(r.slug)) {
      skipped++;
      continue;
    }
    if (!Array.isArray(r.tags)) r.tags = [];
    if (r.tags.includes("dog-friendly")) {
      alreadyTagged++;
      continue;
    }
    r.tags.push("dog-friendly");
    tagged++;
  }
  const out = pretty
    ? JSON.stringify(rows, null, 2) + (original.endsWith("\n") ? "\n" : "")
    : JSON.stringify(rows);
  writeFileSync(filePath, out);
  console.log(
    `${filePath.split("/").pop().padEnd(28)} +${tagged} tagged, ${alreadyTagged} already had it, ${skipped} excluded by name`,
  );
  return { tagged, alreadyTagged, skipped };
}

const dfp = patch(resolve("src/data/places-dfp.json"));
const disc = patch(resolve("src/data/places-discovered.json"));

console.log(
  `\nTotal added: ${dfp.tagged + disc.tagged} dog-friendly tags. ${dfp.alreadyTagged + disc.alreadyTagged} records already carried it. ${dfp.skipped + disc.skipped} excluded.`,
);
