/**
 * Phase 1 copy quality scoring. Classifies every place description with
 * the STYLE.md detector and writes src/data/copy-scores.json:
 *   { computed_at, counts, bySlug }
 * Consumed by /admin/copy-review (worst first) and /admin/data-health.
 *
 * Run: node --import tsx scripts/copy-scores.ts
 */
import { writeFileSync } from "node:fs";
import DESCRIPTIONS_RAW from "../src/data/descriptions.json" with { type: "json" };
import { classifyDescription, type CopyQuality } from "../src/lib/copy-quality";
import { publicPlaces } from "../src/lib/loaders/places";
import type { PlaceDescriptionEntry } from "../src/lib/loaders/placeDescriptions";

function main(): void {
  const counts: Record<CopyQuality, number> = {
    none: 0,
    scraped: 0,
    auto_clean: 0,
    reviewed: 0,
  };
  const bySlug: Record<string, CopyQuality> = {};
  const places = publicPlaces();
  const descriptions = DESCRIPTIONS_RAW as Record<string, PlaceDescriptionEntry>;
  for (const p of places) {
    const q = classifyDescription(
      p.name,
      descriptions[p.slug]?.blurb ?? p.description ?? p.short_blurb,
      descriptions[p.slug]?.status === "approved",
    );
    counts[q]++;
    bySlug[p.slug] = q;
  }
  writeFileSync(
    new URL("../src/data/copy-scores.json", import.meta.url).pathname,
    JSON.stringify({ computed_at: new Date().toISOString(), counts, bySlug }, null, 0),
  );
  const tot = places.length;
  const pct = (n: number) => ((n / tot) * 100).toFixed(1) + "%";
  console.log(
    `copy: ${tot} places. scraped ${counts.scraped} (${pct(counts.scraped)}), ` +
      `auto_clean ${counts.auto_clean} (${pct(counts.auto_clean)}), ` +
      `reviewed ${counts.reviewed}, none ${counts.none}.`,
  );
}

main();
