/**
 * Copy-quality detector tests. Run:
 *   node --import tsx --test tests/copy-quality.test.ts
 * The fixtures are the STYLE.md "before" patterns.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { classifyDescription } from "../src/lib/copy-quality";
import DESCRIPTIONS_RAW from "../src/data/descriptions.json" with { type: "json" };
import PLACES_RAW from "../src/data/places-client.json" with { type: "json" };
import SCORES from "../src/data/copy-scores.json" with { type: "json" };
import { buildCopyScorecard, parseCopyScorecard } from "../scripts/lib/copy-scorecard";
import {
  publicPlaces,
  type PlaceCardData,
} from "../src/lib/loaders/places";
import {
  approvedPlaceDescription,
  type PlaceDescriptionEntry,
} from "../src/lib/loaders/placeDescriptions";

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
  assert.equal(
    classifyDescription(
      "Anything",
      "This factual description was approved by an editor.",
      true,
    ),
    "reviewed",
  );
  assert.equal(
    classifyDescription(
      "Baker Park",
      "Baker Park has walking paths, a lake, tennis courts, and the Joseph D. Baker carillon tower.",
      true,
    ),
    "reviewed",
  );
  assert.equal(
    classifyDescription(
      "Example Cafe",
      "Call us at (301) 555-0100 to book now.",
      true,
    ),
    "scraped",
    "editor approval must not bypass mechanical safety checks",
  );
  assert.equal(
    classifyDescription("Example Cafe", "Example Cafe Patrick St.", true),
    "scraped",
  );
  assert.equal(classifyDescription("Anything", ""), "none");
  console.log("clean, reviewed, none handled");
});

test("committed copy scorecard matches the current dataset", () => {
  const committed = (SCORES as { counts: Record<string, number> }).counts;
  const places = PLACES_RAW as unknown as PlaceCardData[];
  const actual: Record<string, number> = {
    none: 0,
    scraped: 0,
    auto_clean: 0,
    reviewed: 0,
  };
  const bySlug: Record<string, string> = {};
  for (const place of places) {
    const quality = classifyDescription(
      place.name,
      place.short_blurb,
      Boolean(place.description_reviewed),
    );
    actual[quality]++;
    bySlug[place.slug] = quality;
  }
  assert.deepEqual(committed, actual, "run npm run copy:scores after place or copy changes");
  assert.deepEqual(SCORES.bySlug, bySlug, "copy scorecard must match exact classified membership, not just totals");
  const share = actual.scraped / places.length;
  console.log(`dataset: ${actual.scraped}/${places.length} scraped (${(share * 100).toFixed(1)}%)`);
});

test("routine scorecard computation preserves its clock and bytes for unchanged classifications", () => {
  const places = [{ slug: "a", name: "A", short_blurb: "" }, { slug: "b", name: "B", short_blurb: "" }];
  const previous = buildCopyScorecard(places, undefined, new Date("2026-10-31T12:00:00Z"));
  const next = buildCopyScorecard([...places].reverse(), previous, new Date("2026-11-01T12:00:00Z"));
  assert.equal(next, previous);
  assert.equal(JSON.stringify(next), JSON.stringify(previous));
});

test("equal-count seasonal membership swaps require a newly computed exact scorecard", () => {
  const before = [{ slug: "summer", name: "Summer", short_blurb: "" }];
  const previous = buildCopyScorecard(before, undefined, new Date("2026-10-31T12:00:00Z"));
  const next = buildCopyScorecard([{ slug: "winter", name: "Winter", short_blurb: "" }], previous, new Date("2026-11-01T12:00:00Z"));
  assert.deepEqual(next.counts, previous.counts);
  assert.deepEqual(next.bySlug, { winter: "none" });
  assert.equal(next.computed_at, "2026-11-01T12:00:00.000Z");
  assert.notEqual(next, previous);
});

test("duplicate scorecard identities cannot be silently collapsed", () => {
  const place = { slug: "duplicate", name: "Duplicate", short_blurb: "" };
  assert.throws(() => buildCopyScorecard([place, place]), /Duplicate copy-scorecard identity/);
});

test("corrupt or malformed derived scores rebuild from the current classified catalog", () => {
  const places = [{ slug: "current", name: "Current", short_blurb: "" }];
  for (const source of ['{"computed_at":', "null", "[]", JSON.stringify({ computed_at: "2026-10-31T12:00:00Z", counts: {}, bySlug: {} })]) {
    const previous = parseCopyScorecard(source);
    assert.equal(previous, undefined);
    const repaired = buildCopyScorecard(places, previous, new Date("2026-11-01T12:00:00Z"));
    assert.deepEqual(repaired.bySlug, { current: "none" });
    assert.equal(repaired.computed_at, "2026-11-01T12:00:00.000Z");
  }
});

test("valid cached classifications keep their original computation clock", () => {
  const places = [{ slug: "current", name: "Current", short_blurb: "" }];
  const original = buildCopyScorecard(places, undefined, new Date("2026-10-31T12:00:00Z"));
  const previous = parseCopyScorecard(JSON.stringify(original));
  assert.deepEqual(previous, original);
  assert.equal(buildCopyScorecard(places, previous, new Date("2026-11-01T12:00:00Z")), previous);
});

test("every committed approval passes the public loader trust boundary", () => {
  const descriptions = DESCRIPTIONS_RAW as Record<string, PlaceDescriptionEntry>;
  const places = new Map(publicPlaces().map((place) => [place.slug, place]));
  const failures: string[] = [];
  for (const [slug, entry] of Object.entries(descriptions)) {
    if (entry.status !== "approved") continue;
    const place = places.get(slug);
    if (!place || !approvedPlaceDescription(slug, place.name)) {
      failures.push(slug);
    }
  }
  assert.deepEqual(
    failures,
    [],
    "approved entries must be safe, sourced, documented, and loadable",
  );
});
