/**
 * Copy-quality detector tests. Run:
 *   node --import tsx --test tests/copy-quality.test.ts
 * The fixtures are the STYLE.md "before" patterns.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { classifyDescription } from "../src/lib/copy-quality";
import { PLACES } from "../src/data/places";
import SCORES from "../src/data/copy-scores.json" with { type: "json" };

test("STYLE.md scraped patterns are caught", () => {
  assert.equal(classifyDescription("Dancing Bear Toys and Games", "Dancing Bear Toys and Games Patrick St"), "scraped");
  assert.equal(classifyDescription("X", "Located at 100 N Market St Frederick MD 21701 serving the community."), "scraped");
  assert.equal(classifyDescription("Cafe", "You'll love our cozy patio and friendly staff."), "scraped");
  assert.equal(classifyDescription("Bar", "A hidden gem nestled in the heart of vibrant downtown."), "scraped");
  assert.equal(classifyDescription("Spot", "BEST CRAB CAKES!! 🦀 COME HUNGRY"), "scraped");
  assert.equal(classifyDescription("Y", "Cozy."), "scraped"); // too short
  console.log("6 scraped fixtures caught");
});

test("clean prose passes, reviewed and empty handled", () => {
  assert.equal(
    classifyDescription(
      "Brewer's Alley",
      "A brewpub and restaurant on Market Street, one of the first in the modern downtown beer scene. The upstairs room is quieter than the bar.",
    ),
    "auto_clean",
  );
  assert.equal(classifyDescription("Anything", "Approved by an editor.", true), "reviewed");
  assert.equal(classifyDescription("Anything", ""), "none");
  console.log("clean, reviewed, none handled");
});

test("committed copy scorecard matches the current dataset", () => {
  const committed = (SCORES as { counts: Record<string, number> }).counts;
  const actual: Record<string, number> = {
    none: 0,
    scraped: 0,
    auto_clean: 0,
    reviewed: 0,
  };
  for (const place of PLACES) {
    actual[classifyDescription(place.name, place.description ?? place.short_blurb)]++;
  }
  assert.deepEqual(committed, actual, "run npm run copy:scores after place or copy changes");
  const share = actual.scraped / PLACES.length;
  console.log(`dataset: ${actual.scraped}/${PLACES.length} scraped (${(share * 100).toFixed(1)}%)`);
});
