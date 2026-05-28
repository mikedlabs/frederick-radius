#!/usr/bin/env node
/**
 * apply-photo-twin-folds.mjs — fold high-confidence duplicate clusters
 * surfaced by scripts/audit-photo-twins.mjs into places-dedup.json.
 *
 * Picked CONSERVATIVELY: only clusters where every record (a) sits at
 * the same address, (b) is the same category, and (c) has a name that
 * is clearly a variant of one canonical business — not a separate
 * tenant in the same building. The 87-cluster audit caught more
 * candidates than these; the rest are documented in
 * docs/audits/2026-05-27-dfp-photo-twins.md for human review.
 *
 * Also patches one address: City of Frederick Dog Park was stored at
 * "100 S Market St" (City Hall — wrong). Real address per Yelp + the
 * official city facility page is "21-35 N Bentz St" (corner of Bentz
 * and Carroll Parkway, by Baker Park).
 *
 * Idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEDUP_PATH = resolve("src/data/places-dedup.json");
const DFP_PATH = resolve("src/data/places-dfp.json");
const TODAY = "2026-05-27";

/**
 * Each entry is { canonical, folds: [list of duplicate slugs to fold] }.
 * Canonical slugs are kept as their existing form to preserve URLs.
 */
const FOLDS = [
  {
    canonical: "city-of-frederick-dog-park",
    folds: ["doggie-park"],
    why: "Same Google ChIJ, identical pin, both 'dog park' category. doggie-park's address was literally the string 'Doggie Park' (junk).",
  },
  {
    canonical: "court-street-parking-garage-frederick",
    folds: ["court-street-garage"],
    why: "Same parking deck at 2 S Court St; scraped twice with name variations. (Left city-of-frederick-parking-department alone — that's the managing dept, not a dupe of the deck.)",
  },
  {
    canonical: "frederick-health-hospital",
    folds: ["emergency-room", "frederick-health"],
    why: "All three at 400 W 7th St; the ER and 'Frederick Health' (brand) are sub-listings of the hospital itself.",
  },
  {
    canonical: "w-a-tolbard-heating-and-ac-llc",
    folds: ["tolbard-w-a-heating-and-air-conditioning", "wa-tolbard"],
    why: "Same HVAC business at 413 N East St; three name-variant scrapes.",
  },
  {
    canonical: "visit-frederick",
    folds: ["frederick-visitor-center"],
    why: "Same downtown visitor center at 151 S East St; 'Visit Frederick' is the official tourism brand name.",
  },
  {
    canonical: "clue-iq-an-escape-room-experience",
    folds: ["clue-iq"],
    why: "Same escape-room business at 103 S Carroll St; one record is the short brand name.",
  },
  {
    canonical: "west-patrick-street-parking-deck",
    folds: ["west-patrick-street-garage"],
    why: "Same city parking deck at 138 W Patrick St; 'Garage' is the colloquial scrape variant.",
  },
  {
    canonical: "william-r-diggs-memorial-swimming-pool",
    folds: ["diggs-pool"],
    why: "Same public pool at 125 W All Saints St; the short name is the colloquial variant.",
  },
  {
    canonical: "frederick-coffee-company-frederick",
    folds: ["frederick-coffee-co-cafe"],
    why: "Same coffee shop at 100 East St / 100 N East St (same building, two scrape variants on the street name).",
  },
  {
    canonical: "lebherz-oil-and-vinegar-frederick",
    folds: ["love-lebherz-oil-vinegar-emporium-downtown-frederick-md"],
    why: "Same emporium at 214 E Patrick / 214 N Market (corner building, two scrape variants on the street face).",
  },
  {
    canonical: "smoketown-brewing-brunswick",
    folds: ["smoketown-brewing-brunswick-2"],
    why: "Same brewery at 223 W Potomac St Brunswick; second slug is just a dupe with a numeric suffix.",
  },
  {
    canonical: "verbena-salon-spa",
    folds: ["verbena-day-spa"],
    why: "Same Verbena business; one scrape captured the W 7th St address, the other captured a W Patrick St address (likely an older listing). Cleanest to fold and let editors split if Verbena actually has two locations.",
  },
  {
    canonical: "william-r-talley-recreation-center",
    folds: ["william-talley-recreation-center-armory"],
    why: "Same rec center at 121 N Bentz St; the armory and rec center are the same building (the Armory was rebuilt as the Talley Center).",
  },
  {
    canonical: "milkhouse-brewery-mt-airy",
    folds: ["milkhouse-brewery-new-market"],
    why: "Same brewery at 8253 Dollyhyde Rd (the farm is in Mt Airy, not New Market — slug was misleading).",
  },
  {
    canonical: "frederick-county-public-schools",
    folds: ["fcps-maryland"],
    why: "Same school district HQ at 191 S East St; 'FCPS Maryland' is just the acronym scrape.",
  },
];

// Address fix for City of Frederick Dog Park — the existing record
// pinned the dog park at "100 S Market St" (downtown City Hall),
// which is wrong. Real address per Yelp + cityoffrederickmd.gov is
// 21-35 N Bentz St, at the SW corner of Baker Park.
const DOG_PARK_PATCH = {
  slug: "city-of-frederick-dog-park",
  patch: {
    address: "21-35 N Bentz St",
    postal_code: "21701",
    // SW corner of Baker Park, where the dog park is fenced in.
    geom: { lng: -77.4154, lat: 39.4156 },
    short_blurb:
      "Fenced off-leash dog park at the SW corner of Baker Park (N Bentz St & Carroll Parkway).",
    is_verified: false,
    updated_at: TODAY,
  },
};

function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}
function saveJson(p, obj) {
  writeFileSync(p, JSON.stringify(obj));
}

const dedup = loadJson(DEDUP_PATH);
let added = 0;
let skippedExisting = 0;

for (const { canonical, folds } of FOLDS) {
  // Ensure canonical has a self-marker (so applyDedup keeps it).
  if (!dedup[canonical]) {
    dedup[canonical] = { canonical };
    added++;
  }
  for (const dupe of folds) {
    if (dedup[dupe]?.canonical === canonical) {
      skippedExisting++;
      continue;
    }
    if (dedup[dupe]) {
      console.log(
        `[warn] ${dupe} already folds to ${dedup[dupe].canonical} — overwriting to ${canonical}`,
      );
    }
    dedup[dupe] = { canonical };
    added++;
  }
}

saveJson(DEDUP_PATH, dedup);
console.log(
  `dedup-decisions.json: +${added} entries, ${skippedExisting} already in place. Total now ${Object.keys(dedup).length}.`,
);

// Apply the dog-park address fix.
const dfp = loadJson(DFP_PATH);
const idx = dfp.findIndex((r) => r.slug === DOG_PARK_PATCH.slug);
if (idx < 0) {
  console.error(`[skip] ${DOG_PARK_PATCH.slug} not in DFP`);
} else {
  dfp[idx] = { ...dfp[idx], ...DOG_PARK_PATCH.patch };
  saveJson(DFP_PATH, dfp);
  console.log(`places-dfp.json: patched ${DOG_PARK_PATCH.slug} address + geom + blurb.`);
}
