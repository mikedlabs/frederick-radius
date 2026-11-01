/**
 * Phase 1 copy quality scoring. Classifies every place description with
 * the STYLE.md detector and writes src/data/copy-scores.json:
 *   { computed_at, counts, bySlug }
 * Consumed by /admin/copy-review (worst first) and /admin/data-health.
 *
 * Run: node --import tsx scripts/copy-scores.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import PLACES_RAW from "../src/data/places-client.json" with { type: "json" };
import type { PlaceCardData } from "../src/lib/loaders/places";
import { buildCopyScorecard, type CopyScorecard } from "./lib/copy-scorecard";

function main(): void {
  // Score the exact decorated artifact users receive. Raw publicPlaces still
  // contains provider/directory text that the loader intentionally suppresses;
  // counting that hidden text made the admin scorecard report zero missing
  // descriptions while more than a thousand public cards were empty.
  const places = PLACES_RAW as unknown as PlaceCardData[];
  const output = new URL("../src/data/copy-scores.json", import.meta.url);
  const previous: CopyScorecard | undefined = existsSync(output)
    ? JSON.parse(readFileSync(output, "utf8"))
    : undefined;
  const scorecard = buildCopyScorecard(places, previous);
  if (scorecard !== previous) writeFileSync(output, JSON.stringify(scorecard));
  const { counts } = scorecard;
  const tot = places.length;
  const pct = (n: number) => ((n / tot) * 100).toFixed(1) + "%";
  console.log(
    `copy: ${tot} places. scraped ${counts.scraped} (${pct(counts.scraped)}), ` +
      `auto_clean ${counts.auto_clean} (${pct(counts.auto_clean)}), ` +
      `reviewed ${counts.reviewed}, none ${counts.none}.`,
  );
}

main();
