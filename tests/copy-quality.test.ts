/**
 * Copy-quality detector tests. Run:
 *   node --import tsx --test tests/copy-quality.test.ts
 * The fixtures are the STYLE.md "before" patterns.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { classifyDescription, isPlaceholderBlurb } from "../src/lib/copy-quality";
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

test("generated '<Category> in <Town>.' filler is caught, real prose is not", () => {
  // The leaking ≥25-char stubs (shorter ones already fail the length gate).
  assert.equal(isPlaceholderBlurb("Coffee in Downtown Frederick."), true);
  assert.equal(isPlaceholderBlurb("Bakeries in Downtown Frederick."), true);
  assert.equal(isPlaceholderBlurb("Lodging in Frederick County."), true);
  assert.equal(classifyDescription("Tierra y Taza", "Coffee in Downtown Frederick."), "scraped");
  // Real prose that merely ends "... in <place>." must NOT be swept.
  assert.equal(isPlaceholderBlurb("Live music in a converted firehouse downtown."), false);
  assert.equal(isPlaceholderBlurb("Wood-fired pizza and natural wine in an old bank building."), false);
  assert.equal(
    classifyDescription("Sky Stage", "An open-air art installation and performance space in a former building shell."),
    "auto_clean",
  );
  console.log("placeholder filler caught, real prose preserved");
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

test("dataset scraped share matches the audit", () => {
  const counts = (SCORES as { counts: Record<string, number> }).counts;
  const total = PLACES.length;
  const share = counts.scraped / total;
  assert.ok(share > 0.6 && share < 0.85, `scraped share ${(share * 100).toFixed(1)}% in audited range`);
  console.log(`dataset: ${counts.scraped}/${total} scraped (${(share * 100).toFixed(1)}%)`);
});
