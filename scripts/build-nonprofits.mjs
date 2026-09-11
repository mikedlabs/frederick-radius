/**
 * build-nonprofits — the Frederick County nonprofit directory builder.
 *
 * Downloads the IRS Exempt Organizations Business Master File (Maryland
 * extract), filters to Frederick County, maps each org's NTEE code to a human
 * cause bucket, tidies the ALL-CAPS IRS names, and writes
 * src/data/nonprofits.json — the server-only dataset /nonprofits reads.
 *
 * The IRS BMF is authoritative ("every registered tax-exempt org with an
 * active ruling") and refreshed ~monthly. Re-run this to refresh:
 *
 *   node scripts/build-nonprofits.mjs           # download + build
 *   node scripts/build-nonprofits.mjs --local eo_md.csv   # use a local copy
 *
 * County filter: a Frederick-County CITY whitelist (Big Pool is Washington
 * County and is excluded). ZIP prefix alone is NOT used — 217xx bleeds into
 * Washington + Carroll counties (the "over-inclusive ZIP" trap).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "src", "data", "nonprofits.json");
const BMF_URL = "https://www.irs.gov/pub/irs-soi/eo_md.csv";

// Frederick County municipalities + unincorporated communities. Big Pool
// (Washington Co, 21711) deliberately excluded. Mount Airy / Keymar straddle
// the Frederick/Carroll line — kept, flagged `border` so they read honestly.
const FREDERICK_CITIES = new Set([
  "FREDERICK", "MIDDLETOWN", "THURMONT", "NEW MARKET", "IJAMSVILLE",
  "WALKERSVILLE", "BRUNSWICK", "EMMITSBURG", "JEFFERSON", "MONROVIA",
  "KNOXVILLE", "ADAMSTOWN", "BUCKEYSTOWN", "WOODSBORO", "MYERSVILLE",
  "URBANA", "LIBERTYTOWN", "ROCKY RIDGE", "BRADDOCK HEIGHTS", "POINT OF ROCKS",
  "SABILLASVILLE", "LADIESBURG", "TUSCARORA", "UNIONVILLE", "BURKITTSVILLE",
  "ROSEMONT", "MOUNT AIRY", "KEYMAR",
]);
const BORDER_CITIES = new Set(["MOUNT AIRY", "KEYMAR"]);

// NTEE major-group letter → cause bucket. MUST stay in sync with
// src/data/ntee-categories.ts (NTEE_MAJOR_TO_CATEGORY).
const NTEE_MAJOR = {
  A: "arts", B: "education", C: "environment", D: "environment", E: "health",
  F: "health", G: "health", H: "health", I: "community", J: "human-services",
  K: "human-services", L: "human-services", M: "public-safety", N: "youth-recreation",
  O: "youth-recreation", P: "human-services", Q: "international", R: "community",
  S: "community", T: "philanthropy", U: "community", V: "community", W: "community",
  X: "faith", Y: "membership", Z: "other",
};
function nteeToCategory(cd) {
  return NTEE_MAJOR[(cd || "").trim().charAt(0).toUpperCase()] ?? "other";
}

// Acronyms / tokens that should stay uppercase when tidying IRS ALL-CAPS names.
const KEEP_UPPER = new Set([
  "USA", "US", "USO", "VFW", "PTA", "PTO", "PTSA", "YMCA", "YWCA", "FFA", "4-H",
  "FSK", "ISF", "ELC", "FCPS", "FCC", "LLC", "INC", "MD", "DC", "VA", "PA",
  "AME", "UCC", "UMC", "ELCA", "LCMS", "II", "III", "IV", "AARP", "NAACP",
  "ASPCA", "EMS", "EMT", "HOA", "STEM", "GTJHS", "MSD", "NARFE", "ABWA",
  "AMVETS", "BPOE", "IOOF", "AOH", "KOC", "DAV",
]);
const LOWER_WORDS = new Set([
  "of", "the", "and", "for", "a", "an", "in", "on", "at", "to", "by", "&",
]);

function tidyName(raw) {
  const s = (raw || "").trim().replace(/\s+/g, " ");
  if (!s) return s;
  const words = s.split(" ");
  return words
    .map((w, i) => {
      const bare = w.replace(/[^A-Za-z0-9&/-]/g, "");
      const up = bare.toUpperCase();
      if (KEEP_UPPER.has(up)) return w.toUpperCase();
      // Roman-numeral / number-suffix chapters like "NO 13290" keep as-is.
      if (/^\d+$/.test(bare)) return w;
      const lower = w.toLowerCase();
      if (i > 0 && LOWER_WORDS.has(lower)) return lower;
      // Title-case, preserving internal hyphen/slash capitalization.
      return lower.replace(/(^|[\s/-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
    })
    .join(" ");
}

// Minimal RFC-4180-ish CSV parser (handles quoted fields with commas).
function parseCsv(text) {
  const rows = [];
  let field = "", row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function loadCsv() {
  const localFlag = process.argv.indexOf("--local");
  if (localFlag !== -1 && process.argv[localFlag + 1]) {
    const p = process.argv[localFlag + 1];
    console.log(`Reading local CSV: ${p}`);
    return fs.readFileSync(p, "latin1");
  }
  console.log(`Downloading ${BMF_URL} ...`);
  const res = await fetch(BMF_URL, {
    headers: { "User-Agent": "FrederickRadius/1.0 (+https://frederickradius.app; nonprofit directory)" },
  });
  if (!res.ok) throw new Error(`IRS BMF download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("latin1");
}

function num(v) {
  const n = parseInt((v || "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function main() {
  const text = await loadCsv();
  const rows = parseCsv(text);
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const need = ["EIN", "NAME", "STREET", "CITY", "STATE", "ZIP", "SUBSECTION", "RULING", "ASSET_AMT", "INCOME_AMT", "REVENUE_AMT", "NTEE_CD", "STATUS"];
  for (const k of need) if (!(k in idx)) throw new Error(`Missing column ${k}`);

  const out = [];
  const catCounts = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < header.length) continue;
    const city = (row[idx.CITY] || "").trim().toUpperCase();
    if (!FREDERICK_CITIES.has(city)) continue;
    // STATUS 01 = active exemption. Drop revoked/inactive so the directory is live orgs.
    if ((row[idx.STATUS] || "").trim() !== "01") continue;
    const ntee = (row[idx.NTEE_CD] || "").trim();
    const category = nteeToCategory(ntee);
    catCounts[category] = (catCounts[category] || 0) + 1;
    const rulingRaw = (row[idx.RULING] || "").trim(); // YYYYMM
    const rec = {
      ein: (row[idx.EIN] || "").trim(),
      name: tidyName(row[idx.NAME]),
      street: tidyName(row[idx.STREET]),
      city: tidyName(row[idx.CITY]),
      zip: (row[idx.ZIP] || "").trim().slice(0, 5),
      subsection: (row[idx.SUBSECTION] || "").trim(),
      ntee,
      category,
      ruling: rulingRaw.length >= 4 ? rulingRaw.slice(0, 4) : "",
      revenue: num(row[idx.REVENUE_AMT]),
      assets: num(row[idx.ASSET_AMT]),
    };
    if (BORDER_CITIES.has(city)) rec.border = true;
    if (rec.ein && rec.name) out.push(rec);
  }

  // Stable sort: by revenue desc (largest, most active first) then name.
  out.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

  fs.writeFileSync(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${out.length} Frederick County nonprofits → ${path.relative(process.cwd(), OUT)}`);
  console.log("By category:", Object.fromEntries(Object.entries(catCounts).sort((a, b) => b[1] - a[1])));
}

main().catch((e) => { console.error(e); process.exit(1); });
