#!/usr/bin/env node
/**
 * Apply the 17 dfp-mash fixes from the 2026-05-27 audit. One-off.
 *
 * Categories (see docs/audits/2026-05-27-dfp-mash-fixes.md):
 *   A. Closed permanently (1)
 *   B. Real relocations — different building (3)
 *   C1. Address already correct — blurb-only fix (5)
 *   C2. 50 Citizen's Way apostrophe normalization (4)
 *   C3. Same-block/canonical numeric or street-name correction (4)
 *
 * Reads + writes src/data/places-dfp.json in place (compact JSON). After
 * running this, regenerate the slim client set with:
 *   npm run build:client-places
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TODAY = "2026-05-27";
const DFP_PATH = resolve("src/data/places-dfp.json");

/**
 * Patches keyed by slug. Each patch is a shallow merge into the existing
 * record — only fields listed here change. `geom` is replaced atomically
 * when present (intentionally not deep-merged).
 */
const PATCHES = {
  // ─── Group A: closed permanently ───────────────────────────────────────
  "ben-jerrys-14": {
    name: "Ben & Jerry's",
    short_blurb:
      "Ben & Jerry's scoop shop — Frederick storefront confirmed closed (Yelp, Dec 2025).",
    is_operational: "closed_permanently",
    is_verified: false,
    hours_verified: false,
    updated_at: TODAY,
  },

  // ─── Group B: real relocations (different building, geom updated) ──────
  "eagles-aeire-1067": {
    // Fix the "Aeire" misspelling while we're here. Slug stays for URL
    // stability; the canonical Eagles term is "Aerie".
    name: "Eagles Aerie 1067",
    short_blurb:
      "Fraternal Order of Eagles social club — members' bar, lounge, and event hall.",
    address: "207 W Patrick St",
    postal_code: "21701",
    geom: { lng: -77.41550699999999, lat: 39.4138234 },
    is_verified: false,
    hours_verified: false,
    updated_at: TODAY,
  },
  "the-poole-law-group": {
    short_blurb:
      "Bruce Poole, Esq. — civil litigation, estates, and business law in downtown Frederick.",
    address: "100-102 W Church St",
    postal_code: "21701",
    geom: { lng: -77.4123644, lat: 39.4151492 },
    is_verified: false,
    hours_verified: false,
    updated_at: TODAY,
  },
  "green-advantage": {
    short_blurb:
      "Green Advantage Inc — environmental certification programs for builders and tradespeople.",
    address: "1726 Shookstown Rd",
    postal_code: "21702",
    geom: { lng: -77.4478951, lat: 39.4297656 },
    is_verified: false,
    hours_verified: false,
    updated_at: TODAY,
  },

  // ─── Group C1: address already correct — blurb-only fix ────────────────
  "the-stern-group": {
    short_blurb:
      "The Stern Group — residential real estate team, downtown Frederick office.",
    updated_at: TODAY,
  },
  "new-horizon-title": {
    short_blurb: "New Horizon Title — settlement services on W Patrick (Suite 115).",
    updated_at: TODAY,
  },
  "creekside-house": {
    short_blurb:
      "Downtown vacation rental beside Carroll Creek — 3 bedrooms, sleeps five (VRBO 660660).",
    // The stored ChIJ id 404s on Place Details; clear it so a future
    // enrichment pass can re-resolve from name + address.
    google_place_id: null,
    updated_at: TODAY,
  },
  "gabe-fortmann-academy-mortgage": {
    short_blurb:
      "Gabe Fortmann — Academy Mortgage loan officer at the downtown S Market branch.",
    updated_at: TODAY,
  },
  "rick-ridgely-allstate-insurance": {
    short_blurb:
      "Rick Ridgely's Allstate agency — home, auto, life, and renters insurance.",
    updated_at: TODAY,
  },

  // ─── Group C2: 50 Citizen's Way apostrophe normalization ───────────────
  "tony-little-jane-moore-real-estate-teams-llc": {
    short_blurb:
      "Tony Little & Jane Moore — residential real estate team at Creekside Plaza.",
    address: "50 Citizen's Way # 400",
    geom: { lng: -77.41197749999999, lat: 39.4129131 },
    is_verified: false,
    updated_at: TODAY,
  },
  "trina-wagner": {
    short_blurb: "Trina Wagner, Realtor — Frederick-area residential real estate.",
    address: "50 Citizen's Way",
    geom: { lng: -77.4120123, lat: 39.4129309 },
    is_verified: false,
    updated_at: TODAY,
  },
  "george-mason-mortgage-llc": {
    short_blurb:
      "George Mason Mortgage — local loan officers for purchase and refinance.",
    address: "50 Citizen's Way Ste 303",
    geom: { lng: -77.4120123, lat: 39.4129309 },
    is_verified: false,
    updated_at: TODAY,
  },
  "creekside-plaza-llc": {
    short_blurb:
      "Creekside Plaza — Class A office building (management c/o Preston Properties).",
    address: "50 Citizen's Way # 400",
    geom: { lng: -77.41194879999999, lat: 39.4128953 },
    is_verified: false,
    updated_at: TODAY,
  },

  // ─── Group C3: same-block / canonical numeric or street fix ────────────
  "schley-park": {
    short_blurb:
      "Schley Park — small Hood College–adjacent green with walking paths.",
    address: "301 N College Pkwy",
    geom: { lng: -77.41900679999999, lat: 39.4186379 },
    is_verified: false,
    updated_at: TODAY,
  },
  "harmon-field": {
    short_blurb: "Harmon Field — neighborhood playground and ballfield, S Winchester St.",
    address: "42 Winchester St",
    geom: { lng: -77.4069006, lat: 39.4083063 },
    is_verified: false,
    updated_at: TODAY,
  },
  "emily-d-gordon-advanced-rolfer": {
    short_blurb:
      "Emily D. Gordon — Advanced Rolfer® bodywork, carriage house behind 243 W Patrick.",
    address: "243 W Patrick St",
    geom: { lng: -77.4169172, lat: 39.4138551 },
    is_verified: false,
    updated_at: TODAY,
  },
  elliott: {
    name: "Elliotts",
    short_blurb: "Elliotts — home goods and gifts on E Patrick St.",
    address: "123 E Patrick St",
    geom: { lng: -77.4081111, lat: 39.4140775 },
    is_verified: false,
    updated_at: TODAY,
  },
};

function applyPatches(rows) {
  const bySlug = new Map(rows.map((r, i) => [r.slug, i]));
  let applied = 0;
  for (const [slug, patch] of Object.entries(PATCHES)) {
    const idx = bySlug.get(slug);
    if (idx == null) {
      console.error(`[skip] not found: ${slug}`);
      continue;
    }
    const before = rows[idx];
    rows[idx] = { ...before, ...patch };
    // Clean up null fields (we use null to mean "clear this")
    for (const k of Object.keys(patch)) {
      if (patch[k] === null) delete rows[idx][k];
    }
    applied++;
    console.log(
      `[ok]   ${slug.padEnd(46)} ${Object.keys(patch).filter((k) => k !== "updated_at").join(", ")}`,
    );
  }
  return applied;
}

const dfp = JSON.parse(readFileSync(DFP_PATH, "utf8"));
const n = applyPatches(dfp);
writeFileSync(DFP_PATH, JSON.stringify(dfp));
console.log(`\nApplied ${n} patches → ${DFP_PATH}`);
