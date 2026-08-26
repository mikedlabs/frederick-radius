/**
 * Location parser unit tests. Run: npx tsx tests/location.test.ts
 * Plain assertions (no test framework dependency) — exits non-zero on fail.
 */
import assert from "node:assert/strict";
import { parseLocation, normalizeForCache } from "../src/lib/ingest/location";

let pass = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); process.exitCode = 1; }
}

console.log("location.parseLocation");

t("HTML venue + street (the canonical CivicEngage shape)", () => {
  const r = parseLocation("<p>Multipurpose Room</p> - 121 N Bentz St  Frederick MD 21701");
  assert.equal(r.venueName, "Multipurpose Room");
  assert.match(r.address!, /121 N Bentz St/);
  assert.equal(r.unparseable, false);
  assert.ok(r.normAddress && !r.normAddress.includes("<"));
});

t("venue + street, no HTML", () => {
  const r = parseLocation("Baker Park - 121 N Bentz St, Frederick, MD 21701");
  assert.equal(r.venueName, "Baker Park");
  assert.match(r.address!, /Frederick, MD 21701/);
  assert.equal(r.unparseable, false);
});

t("street only, no venue", () => {
  const r = parseLocation("121 N Bentz St Frederick MD 21701");
  assert.equal(r.venueName, undefined);
  assert.ok(r.address);
  assert.equal(r.unparseable, false);
});

t("venue only, no address (still usable, not dropped)", () => {
  const r = parseLocation("Community Pool");
  assert.equal(r.venueName, "Community Pool");
  assert.equal(r.address, undefined);
  assert.equal(r.unparseable, false);
});

t("town+zip without a street stays approximate instead of becoming an exact pin", () => {
  const r = parseLocation("Downtown Frederick MD 21701");
  assert.equal(r.venueName, "Downtown Frederick MD 21701");
  assert.equal(r.address, undefined);
  assert.equal(r.unparseable, false);
});

t("inline venue text is separated from a geocodable street address", () => {
  const r = parseLocation(
    "Hood College - Whitaker Campus Center, Commons 530 Hodson Dr Frederick MD 21701",
  );
  assert.equal(r.venueName, "Hood College, Whitaker Campus Center, Commons");
  assert.equal(r.address, "530 Hodson Dr Frederick MD 21701");
  assert.equal(r.unparseable, false);
});

t("an unseparated venue and address keep both useful fields", () => {
  const r = parseLocation(
    "Warehouse Cinema 1301 W Patrick Street Frederick MD 21702",
  );
  assert.equal(r.venueName, "Warehouse Cinema");
  assert.equal(r.address, "1301 W Patrick Street Frederick MD 21702");
});

t("empty / null → unparseable", () => {
  assert.equal(parseLocation("").unparseable, true);
  assert.equal(parseLocation(null).unparseable, true);
  assert.equal(parseLocation(undefined).unparseable, true);
  assert.equal(parseLocation("<p></p>").unparseable, true);
});

t("normalizeForCache stable across formatting", () => {
  const a = normalizeForCache("121 N. Bentz St., Suite 4, Frederick, MD 21701");
  const b = normalizeForCache("121 N Bentz St  Ste 4  Frederick MD 21701");
  assert.equal(a, b);
});

t("first ' - ' split only (zip+4 hyphen safe)", () => {
  const r = parseLocation("City Hall - 101 N Court St, Frederick, MD 21701-1234");
  assert.equal(r.venueName, "City Hall");
  assert.match(r.address!, /21701-1234/);
});

console.log(`\n${pass} location assertions passed`);
