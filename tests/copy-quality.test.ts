/**
 * Copy-quality detector tests. Run:
 *   node --import tsx --test tests/copy-quality.test.ts
 * The fixtures are the STYLE.md "before" patterns.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { classifyDescription } from "../src/lib/copy-quality";
import DESCRIPTIONS_RAW from "../src/data/descriptions.json" with { type: "json" };
import SCORES from "../src/data/copy-scores.json" with { type: "json" };
import { publicPlaces } from "../src/lib/loaders/places";
import type { PlaceDescriptionEntry } from "../src/lib/loaders/placeDescriptions";

test("STYLE.md scraped patterns are caught", () => {
  assert.equal(classifyDescription("Dancing Bear Toys and Games", "Dancing Bear Toys and Games Patrick St"), "scraped");
  assert.equal(classifyDescription("X", "Located at 100 N Market St Frederick MD 21701 serving the community."), "scraped");
  assert.equal(classifyDescription("Cafe", "You'll love our cozy patio and friendly staff."), "scraped");
  assert.equal(classifyDescription("Bar", "A hidden gem nestled in the heart of vibrant downtown."), "scraped");
  assert.equal(classifyDescription("Spot", "BEST CRAB CAKES!! 🦀 COME HUNGRY"), "scraped");
  assert.equal(classifyDescription("Y", "Cozy."), "scraped"); // too short
  assert.equal(
    classifyDescription(
      "Cafe Nola",
      "They have bands sometimes on the weekends and are sometimes open.",
    ),
    "scraped",
  );
  console.log("7 scraped fixtures caught");
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
  const descriptions = DESCRIPTIONS_RAW as Record<string, PlaceDescriptionEntry>;
  const places = publicPlaces();
  const actual: Record<string, number> = {
    none: 0,
    scraped: 0,
    auto_clean: 0,
    reviewed: 0,
  };
  for (const place of places) {
    actual[classifyDescription(
      place.name,
      descriptions[place.slug]?.blurb ?? place.description ?? place.short_blurb,
      descriptions[place.slug]?.status === "approved",
    )]++;
  }
  assert.deepEqual(committed, actual, "run npm run copy:scores after place or copy changes");
  const share = actual.scraped / places.length;
  console.log(`dataset: ${actual.scraped}/${places.length} scraped (${(share * 100).toFixed(1)}%)`);
});
