/**
 * Hours provenance + coverage gate tests. Run:
 *   node --import tsx --test tests/hours.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { rankPlaces, hoursCoverage, shouldHideOpenNow } from "../src/lib/loaders/places";

test("enriched places carry google_places hours provenance", () => {
  const all = rankPlaces({});
  const g = all.filter((p) => p.hours_source === "google_places");
  assert.ok(g.length > 0, "some places have Google hours");
  for (const p of g.slice(0, 5)) {
    assert.equal(p.hours_source, "google_places");
    assert.ok(p.hours_updated_at, "google-sourced hours carry a timestamp");
  }
  console.log(`${g.length} places stamped google_places, coverage ${(hoursCoverage(all) * 100).toFixed(1)}%`);
});

test("coverage is honest and the gate follows the 60% bar", () => {
  const all = rankPlaces({});
  const cov = hoursCoverage(all);
  assert.ok(cov >= 0.6 && cov <= 1, "current materialized coverage clears the 60% bar");
  assert.equal(shouldHideOpenNow(all), false);

  const lowCoverage = all.slice(0, 10).map((place, index) =>
    index === 0
      ? place
      : { ...place, hours: undefined, hours_verified: false },
  );
  assert.ok(hoursCoverage(lowCoverage) < 0.6);
  assert.equal(shouldHideOpenNow(lowCoverage), true);
  assert.equal(hoursCoverage([]), 0);
  console.log(`gate active, coverage ${(cov * 100).toFixed(1)}% >= 60% -> Open-now available`);
});
