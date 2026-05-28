#!/usr/bin/env node
/**
 * Apply follow-up fixes for the 5 candidates the 2026-05-27 sample-50
 * smoke test surfaced. Verified per-record against venue website +
 * Yelp/BBB/Downtown Frederick Partnership (sources documented in
 * docs/audits/2026-05-27-dfp-sample-50-followups.md). One-off, idempotent.
 *
 * Categories:
 *   - 3 real relocations (gastro, cosmetic dentistry, surelocked)
 *   - 1 no-change blurb fix (pain-management — Yelp Jan 2026 confirms
 *     205 Broadway is still primary; McCain Dr is a second location)
 *   - 1 bad-data needs_verification flag (cranberryjade — "Frederick"
 *     was the entire address field, not a real address)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TODAY = "2026-05-27";
const DFP_PATH = resolve("src/data/places-dfp.json");

const PATCHES = {
  // ── Real relocations ─────────────────────────────────────────────────
  "frederick-gastroenterology-associates": {
    short_blurb:
      "Frederick Gastroenterology Associates — endoscopy and GI care at the Guilford Drive medical campus.",
    address: "7109 Guilford Dr Suite 300",
    postal_code: "21704",
    geom: { lng: -77.4188033, lat: 39.3950925 },
    is_verified: false,
    hours_verified: false,
    updated_at: TODAY,
  },
  "frederick-cosmetic-family-dentistry": {
    short_blurb:
      "Frederick Cosmetic & Family Dentistry — general and cosmetic dentistry off Thomas Johnson Dr.",
    address: "198 Thomas Johnson Dr Suite 20",
    postal_code: "21702",
    geom: { lng: -77.4096674, lat: 39.4391485 },
    is_verified: false,
    hours_verified: false,
    updated_at: TODAY,
  },
  "surelocked-in-escape-games": {
    short_blurb:
      "Surelocked In — escape rooms downtown on E Patrick (moved from 5 N Market in 2026).",
    address: "13 E Patrick St",
    postal_code: "21701",
    geom: { lng: -77.4103564, lat: 39.4142029 },
    is_verified: false,
    hours_verified: false,
    updated_at: TODAY,
  },

  // ── No-change blurb fix ──────────────────────────────────────────────
  "pain-management-massage-studio": {
    // 205 Broadway is the primary downtown studio per Yelp's Jan 2026
    // listing + Downtown Frederick Partnership. The McCain Dr listing
    // Google returned is a second location ("Studio 2" per massagebook).
    short_blurb:
      "Pain Management Massage & Studio — therapeutic massage, lymphatic drainage, downtown studio.",
    updated_at: TODAY,
  },

  // ── Bad data → needs_verification ────────────────────────────────────
  "cranberryjade-services-middletown-md": {
    // The DFP `address` field was literally the word "Frederick"; the
    // business is a Middletown-based small-business media consultancy
    // (per Facebook). No verifiable street address — flag and reposition
    // the pin to Middletown so the map at least doesn't lie.
    name: "CranberryJade Services",
    short_blurb:
      "CranberryJade Services — Middletown-based small-business media and marketing help.",
    address: "Middletown, MD",
    postal_code: "21769",
    municipality: "middletown",
    geom: { lng: -77.5447, lat: 39.4434 },
    is_operational: "needs_verification",
    is_verified: false,
    hours_verified: false,
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
    rows[idx] = { ...rows[idx], ...patch };
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
