#!/usr/bin/env node
/**
 * audit-photo-twins.mjs — find records on the map whose hero thumbnail
 * resolves back to the SAME Google Place ID. Surfaces duplicates the
 * existing dedup pipeline missed because the records carry different
 * placeholder UUIDs in `google_place_id` but were enriched from the
 * same underlying Google place.
 *
 * Three categories will emerge:
 *
 *   TRUE DUPE       — Same name (normalized), same lat/lng, same ChIJ.
 *                     Two records that should fold into one in
 *                     places-dedup.json.
 *   MULTI-TENANT    — Different business names at the same street
 *                     address sharing the same building photo from
 *                     Google. Real distinct places; the shared photo
 *                     is misleading but the records are correct.
 *   WRONG PHOTO     — Different businesses, different addresses,
 *                     unrelated names, but all carry the same Google
 *                     photo. The enrichment misapplied a photo to
 *                     unrelated records — a bug worth fixing upstream.
 *
 * Read-only. Emits audit/photo-twins.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CLIENT_PATH = resolve("src/data/places-client.json");
const OUT = resolve("audit/photo-twins.json");

const places = JSON.parse(readFileSync(CLIENT_PATH, "utf8"));

function chijFromPhoto(url) {
  if (!url) return null;
  const m = url.match(/places%2F(ChIJ[A-Za-z0-9_-]+)%2Fphotos/);
  return m ? m[1] : null;
}

function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function normName(n) {
  return (n || "")
    .toLowerCase()
    .replace(/['’&]/g, "")
    .replace(/\b(the|llc|inc|co|corp|ltd|pa)\b/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normAddrPrefix(a) {
  if (!a) return "";
  return a.toLowerCase().split(/[,#]/)[0].replace(/\s+/g, " ").trim();
}

function tokenize(n) {
  return new Set(normName(n).split(" ").filter((t) => t.length > 1));
}
function jaccard(a, b) {
  const A = tokenize(a), B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

// Recognize a junk/non-address field: missing, single word repeating
// the place name, or just a city name.
function isJunkAddress(addr, name) {
  if (!addr) return true;
  const a = addr.toLowerCase().trim();
  if (!/\d/.test(a)) return true; // no street number → not a real address
  if (a === (name || "").toLowerCase().trim()) return true;
  return false;
}

function classifyCluster(rows) {
  const names = rows.map((r) => normName(r.name));
  const addrs = rows.map((r) => normAddrPrefix(r.address));
  const junkAddrs = rows.map((r) => isJunkAddress(r.address, r.name));
  const geoms = rows.map((r) => r.geom);
  let allSameGeom = true;
  let allIdenticalGeom = true;
  let allSameAddr = true;
  let allHighOverlap = true;
  let allLowOverlap = true;
  let allSameCategory = true;
  let allSameStreetNum = true;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const m = haversineMeters(geoms[i], geoms[j]);
      if (m > 20) allSameGeom = false;
      if (
        !geoms[i] ||
        !geoms[j] ||
        Math.abs(geoms[i].lat - geoms[j].lat) > 1e-5 ||
        Math.abs(geoms[i].lng - geoms[j].lng) > 1e-5
      )
        allIdenticalGeom = false;
      if (addrs[i] !== addrs[j]) allSameAddr = false;
      // Same street number is a softer match — handles "100 East St"
      // vs "100 N East St" and "214 E Patrick" vs "214 N Market" (the
      // same building scraped from two different street faces).
      const numI = (rows[i].address || "").match(/^(\d+)/)?.[1];
      const numJ = (rows[j].address || "").match(/^(\d+)/)?.[1];
      if (!numI || !numJ || numI !== numJ) allSameStreetNum = false;
      const ov = jaccard(names[i], names[j]);
      if (ov < 0.5) allHighOverlap = false;
      if (ov > 0.2) allLowOverlap = false;
      if (rows[i].category !== rows[j].category) allSameCategory = false;
    }
  }
  // TRUE_DUPE = the records are literally the same place.
  //   A. Same normalized address. Same place, scraped twice.
  //   B. Same street number across all records (handles two-faced
  //      buildings: 214 E Patrick vs 214 N Market).
  //   C. Identical pin AND high name overlap.
  //   D. Identical pin AND at least one record's "address" field is
  //      junk (the place name, missing, or no street number) — the
  //      junk record is clearly the wrong twin and should fold.
  if (allSameAddr) return "TRUE_DUPE";
  if (allSameStreetNum && allSameCategory) return "TRUE_DUPE";
  if (allIdenticalGeom && allHighOverlap) return "TRUE_DUPE";
  if (allIdenticalGeom && junkAddrs.some((j) => j) && allSameCategory)
    return "TRUE_DUPE";

  if (allSameGeom && allHighOverlap) return "TRUE_DUPE";
  if (allSameGeom && !allHighOverlap && !allLowOverlap)
    return "MAYBE_MULTI_TENANT_OR_DUPE";
  if (allSameGeom && allLowOverlap) return "MULTI_TENANT";
  // Different addresses, different pins, unrelated names → enrichment
  // misapplied the same photo to unrelated records.
  if (!allSameGeom && allLowOverlap) return "WRONG_PHOTO";
  return "REVIEW";
}

const byChij = new Map();
for (const r of places) {
  const c = chijFromPhoto(r.google_photo_url);
  if (!c) continue;
  if (!byChij.has(c)) byChij.set(c, []);
  byChij.get(c).push(r);
}

const clusters = [...byChij.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([chij, rows]) => {
    const verdict = classifyCluster(rows);
    return {
      chij,
      size: rows.length,
      verdict,
      records: rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        address: r.address,
        municipality: r.municipality,
        geom: r.geom,
        source: r.source,
        category: r.category,
      })),
    };
  })
  .sort((a, b) => {
    const order = { TRUE_DUPE: 0, MAYBE_MULTI_TENANT_OR_DUPE: 1, MULTI_TENANT: 2, REVIEW: 3, WRONG_PHOTO: 4 };
    return (order[a.verdict] ?? 9) - (order[b.verdict] ?? 9) || b.size - a.size;
  });

const counts = clusters.reduce((acc, c) => {
  acc[c.verdict] = (acc[c.verdict] || 0) + 1;
  return acc;
}, {});
const totalAffectedRecords = clusters.reduce((n, c) => n + c.size, 0);

const summary = {
  generated: new Date().toISOString(),
  scanned: places.length,
  clusters: clusters.length,
  affected_records: totalAffectedRecords,
  counts,
};

console.log(JSON.stringify(summary, null, 2));
console.log();
console.log("Top clusters by verdict:");
for (const verdict of ["TRUE_DUPE", "MAYBE_MULTI_TENANT_OR_DUPE", "MULTI_TENANT", "REVIEW", "WRONG_PHOTO"]) {
  const list = clusters.filter((c) => c.verdict === verdict);
  if (!list.length) continue;
  console.log(`\n  [${verdict}] ${list.length} clusters`);
  for (const c of list.slice(0, 8)) {
    console.log(`    • ${c.chij}  (size ${c.size})`);
    for (const r of c.records) {
      console.log(`        - ${r.slug.padEnd(48)} | ${r.name.slice(0, 32).padEnd(32)} | ${(r.address || "").slice(0, 28)}`);
    }
  }
}

writeFileSync(OUT, JSON.stringify({ summary, clusters }, null, 2));
console.log(`\nwrote ${OUT}`);
