/**
 * Dedup pipeline regression tests. Run:
 *   node --import tsx --test tests/dedup.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PLACES } from "../src/data/places";
import { applyDedup } from "../src/lib/loaders/places";
import DEDUP from "../src/data/places-dedup.json" with { type: "json" };

const map = DEDUP as Record<string, { canonical: string }>;
const foldedCount = Object.entries(map).filter(([s, v]) => v.canonical !== s).length;

test("applyDedup folds duplicates into canonicals (curated wins)", () => {
  const before = PLACES.length;
  const after = applyDedup(PLACES);

  // Non-mutating: PLACES itself is unchanged, which is the flag-off path.
  assert.equal(PLACES.length, before);
  assert.equal(after.length, before - foldedCount);

  const slugs = new Set(after.map((p) => p.slug));
  // Folded duplicate slugs are gone; the curated canonical remains.
  assert.ok(!slugs.has("isabellas-taverna-and-tapas-bar"), "Isabella's DFP variant folded");
  assert.ok(!slugs.has("isabellas-taverna-tapas-bar"), "Isabella's DFP variant folded");
  assert.ok(slugs.has("isabellas-taverna-tapas-bar-frederick"), "curated Isabella's kept");
  assert.ok(!slugs.has("hootch-banter"), "Hootch DFP variant folded");
  // The curated record is hootch-and-banter-frederick (places.ts); the
  // plain hootch-and-banter is DFP-only and folds. The prior committed
  // artifact predated the curated record, so its canonical was stale.
  assert.ok(!slugs.has("hootch-and-banter"), "Hootch DFP variant folded");
  assert.ok(slugs.has("hootch-and-banter-frederick"), "curated Hootch kept");

  console.log(`dedup: ${before} -> ${after.length} (${foldedCount} folded), ${after.length} canonical+singleton`);
});

test("a folded duplicate maps to a canonical that exists", () => {
  for (const [slug, v] of Object.entries(map)) {
    if (v.canonical === slug) continue;
    assert.ok(map[v.canonical], `${slug} canonical ${v.canonical} must itself be an entry`);
  }
  console.log("all folded slugs point to a real canonical");
});
