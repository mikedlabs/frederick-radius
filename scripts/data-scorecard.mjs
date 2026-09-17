/**
 * data-scorecard.mjs — repeatable data-quality scorecard for the place catalog.
 *
 *   node scripts/data-scorecard.mjs            # prints summary
 *   node scripts/data-scorecard.mjs --md       # also writes docs/audits/<date>-scorecard.md
 *
 * Reads the live slim set (places-client.json) and the enrichment map
 * (places-enrichment.json). No network, no writes unless --md. The point
 * is to turn "data quality" from a vibe into a number you can watch move
 * after each cleaning pass. Pair it with the cleaning lanes in
 * DATA-STRATEGY-2026-05-30.md.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const P = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/places-client.json"), "utf8"));
const ENR = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/places-enrichment.json"), "utf8"));

const n = P.length;
const pct = (x) => ((x / n) * 100).toFixed(1) + "%";

// ---- field coverage ----------------------------------------------------
const bySource = {};
let noBlurb = 0, thinBlurb = 0, placeholder = 0, noRating = 0, noPhoto = 0,
    noWebsite = 0, noPhone = 0, withHours = 0;
const townRe = /\bin (frederick|thurmont|brunswick|urbana|walkersville|middletown|mount airy|emmitsburg|new market|myersville|jefferson|woodsboro|burkittsville)\b/i;

for (const p of P) {
  bySource[p.source] = (bySource[p.source] || 0) + 1;
  const b = (p.short_blurb || "").trim();
  if (!b) noBlurb++;
  else if (b.length < 40) thinBlurb++;
  if (b && townRe.test(b) && b.split(/\s+/).length <= 6) placeholder++;
  if (!p.google_rating) noRating++;
  if (!p.google_photo_url) noPhoto++;
  if (!p.website) noWebsite++;
  if (!p.phone) noPhone++;
  const e = ENR[p.slug];
  if (e && (e.has_hours || (e.weekday_hours && e.weekday_hours.length))) withHours++;
}

// ---- geocode sanity ----------------------------------------------------
const BBOX = { south: 39.265, west: -77.700, north: 39.745, east: -77.150 };
let offBbox = 0, nullIsland = 0;
const coordKey = {};
for (const p of P) {
  const { lng, lat } = p.geom || {};
  if (lng === 0 && lat === 0) nullIsland++;
  if (lat < BBOX.south || lat > BBOX.north || lng < BBOX.west || lng > BBOX.east) offBbox++;
  const k = `${lng?.toFixed(5)},${lat?.toFixed(5)}`;
  (coordKey[k] = coordKey[k] || []).push(p.name);
}
const stackedCoords = Object.values(coordKey).filter((a) => a.length > 1).length;

// ---- remaining duplicate candidates (post-dedup live set) --------------
const norm = (s) => s.toLowerCase().replace(/['’&.]/g, "").replace(/\b(the|llc|inc|co|company)\b/g, "").replace(/\s+/g, " ").trim();
const haversine = (a, b) => {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const byNorm = {};
for (const p of P) (byNorm[norm(p.name)] = byNorm[norm(p.name)] || []).push(p);
const dupCandidates = [];
for (const group of Object.values(byNorm)) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i++)
    for (let j = i + 1; j < group.length; j++)
      if (haversine(group[i].geom, group[j].geom) < 200)
        dupCandidates.push([group[i].name, group[j].name, Math.round(haversine(group[i].geom, group[j].geom)) + "m"]);
}

// ---- output ------------------------------------------------------------
const lines = [];
const row = (label, val) => lines.push(`  ${label.padEnd(34)} ${val}`);
lines.push(`\nFREDERICK RADIUS — DATA SCORECARD  (${new Date().toISOString().slice(0, 10)})`);
lines.push(`Catalog: ${n} live places\n`);
lines.push("COVERAGE (higher is better):");
row("verified hours", `${withHours} (${pct(withHours)})  <- the open-now gate`);
row("has rating", `${n - noRating} (${pct(n - noRating)})`);
row("has photo", `${n - noPhoto} (${pct(n - noPhoto)})`);
row("has website", `${n - noWebsite} (${pct(n - noWebsite)})`);
row("has phone", `${n - noPhone} (${pct(n - noPhone)})`);
lines.push("\nDESCRIPTION QUALITY (lower is better):");
row("thin blurb (<40 chars)", `${thinBlurb} (${pct(thinBlurb)})`);
row("placeholder 'X in Town'", `${placeholder} (${pct(placeholder)})`);
row("no blurb at all", `${noBlurb} (${pct(noBlurb)})`);
lines.push("\nGEOCODE SANITY:");
row("outside county bbox", String(offBbox));
row("null island (0,0)", String(nullIsland));
row("coords shared by 2+ places", String(stackedCoords));
lines.push("\nDEDUP (remaining same-name within 200m):");
row("duplicate candidate pairs", String(dupCandidates.length));
for (const d of dupCandidates.slice(0, 12)) lines.push(`    ${d[0]}  <->  ${d[1]}  (${d[2]})`);
lines.push("\nBY SOURCE:");
for (const [s, c] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) row(s, `${c} (${pct(c)})`);

const out = lines.join("\n");
console.log(out);

if (process.argv.includes("--md")) {
  const f = path.join(ROOT, "docs/audits", `${new Date().toISOString().slice(0, 10)}-scorecard.md`);
  fs.writeFileSync(f, "# Data scorecard\n\n```\n" + out + "\n```\n");
  console.log("\nwrote", path.relative(ROOT, f));
}
