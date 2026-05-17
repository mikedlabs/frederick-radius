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

test("coverage is honest and the gate hides Open-now under the 60% bar", () => {
  const all = rankPlaces({});
  const cov = hoursCoverage(all);
  assert.ok(cov >= 0 && cov < 0.6, "current coverage is well under the 60% bar");
  // HOURS_GATE defaults on (owner directive, 2026-05-16). Under 60%
  // verified-hours coverage the Open-now affordance hides in favor of
  // an honest message. Set HOURS_GATE=0 for the always-show rollback.
  assert.equal(shouldHideOpenNow(all), true);
  assert.equal(hoursCoverage([]), 0);
  console.log(`gate active, coverage ${(cov * 100).toFixed(1)}% < 60% -> Open-now hidden`);
});
