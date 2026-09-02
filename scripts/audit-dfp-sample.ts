/**
 * 50-record random sample smoke test for places-dfp.json.
 *
 * Goal: estimate how many DFP rows disagree with Google Places on
 * address, beyond the blurb-mash pattern caught by the 17-record fix.
 *
 * For each sampled row:
 *   - If google_place_id is a real ChIJ id → Place Details by id
 *   - Otherwise (UUID placeholder, etc.) → Text Search by name + addr
 *
 * Disagreement rule (intentionally lenient — we want to catch real
 * data issues, not punish whitespace or apostrophes):
 *   1. Normalize both sides (lowercase, strip USA/comma, fold
 *      apostrophes, "st."→"st", "ste"→"#", collapse spaces).
 *   2. Compare the street-number-and-name prefix only (cut at first
 *      comma or "frederick"/"md"). If the prefixes match, AGREE.
 *   3. If geom is present and within 150m of Google's pin, AGREE
 *      regardless of text (handles same-place address typos).
 *
 * Output: audit/dfp-sample-50.json with one row per sample plus a
 * tally summary.
 *
 * Plan: npm exec tsx scripts/audit-dfp-sample.ts -- --seed 20260527
 * Live: GOOGLE_PLACES_API_KEY=... npm exec tsx scripts/audit-dfp-sample.ts -- --seed 20260527 --live --confirm --limit 50
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getPlaceDetails,
  resolveAndEnrich,
  googlePlacesConfigured,
} from "@/lib/integrations/google-places";
import {
  assertManualGoogleArgs,
  createManualGoogleCallBudget,
  googleCostPreview,
  parseManualGoogleRun,
} from "./lib/manual-google-run";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(".env.local"), "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {}
}
loadEnvLocal();

type DfpRow = {
  slug: string;
  name: string;
  address?: string;
  postal_code?: string | number;
  geom?: { lat: number; lng: number };
  google_place_id?: string;
};

const CHIJ_RE = /^ChIJ[A-Za-z0-9_-]+$/;

function normAddr(s?: string): string {
  if (!s) return "";
  let x = s.toLowerCase();
  x = x.replace(/'/g, "");
  x = x.replace(/\./g, "");
  x = x.replace(/\busa\b/g, "");
  x = x.replace(/\bunited states\b/g, "");
  x = x.replace(/\bsuite\b/g, "ste");
  x = x.replace(/\bunit\b/g, "ste");
  x = x.replace(/#/g, "ste ");
  x = x.replace(/\bavenue\b/g, "ave");
  x = x.replace(/\bstreet\b/g, "st");
  x = x.replace(/\bcourt\b/g, "ct");
  x = x.replace(/\bdrive\b/g, "dr");
  x = x.replace(/\broad\b/g, "rd");
  x = x.replace(/\bparkway\b/g, "pkwy");
  x = x.replace(/\s+/g, " ").trim();
  return x;
}

function streetPrefix(s?: string): string {
  if (!s) return "";
  const n = normAddr(s);
  // Cut at first comma or " frederick"/" md".
  const cuts = [
    n.indexOf(","),
    n.indexOf(" frederick"),
    n.indexOf(" md "),
    n.indexOf(" mt airy"),
  ].filter((i) => i > 0);
  const cut = cuts.length ? Math.min(...cuts) : n.length;
  return n.slice(0, cut).trim();
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const args = process.argv.slice(2);
  assertManualGoogleArgs(args, { valueFlags: ["--seed"], maxPositionals: 1 });
  const run = parseManualGoogleRun(args, {
    defaultLimit: 50,
    maxLimit: 50,
  });
  const seedIndex = args.indexOf("--seed");
  const legacySeed = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
  const seedRaw = seedIndex >= 0 ? args[seedIndex + 1] : legacySeed;
  if (seedIndex >= 0 && (!seedRaw || seedRaw.startsWith("--"))) {
    throw new Error("--seed requires a numeric value.");
  }
  const seed = Number(seedRaw ?? 20260527);
  if (!Number.isSafeInteger(seed)) {
    throw new Error("--seed must be a safe integer.");
  }
  const dfp = JSON.parse(
    readFileSync(resolve("src/data/places-dfp.json"), "utf8"),
  ) as DfpRow[];
  // Filter to rows with both name+address (we need an address to compare).
  const eligible = dfp.filter((r) => r.name && r.address);
  // The 17 fixed records are excluded so we measure the broader rate.
  const FIXED = new Set([
    "ben-jerrys-14",
    "eagles-aeire-1067",
    "the-poole-law-group",
    "green-advantage",
    "the-stern-group",
    "new-horizon-title",
    "creekside-house",
    "gabe-fortmann-academy-mortgage",
    "rick-ridgely-allstate-insurance",
    "tony-little-jane-moore-real-estate-teams-llc",
    "trina-wagner",
    "george-mason-mortgage-llc",
    "creekside-plaza-llc",
    "schley-park",
    "harmon-field",
    "emily-d-gordon-advanced-rolfer",
    "elliott",
    "spinners-pinball-arcade",
  ]);
  const pool = eligible.filter((r) => !FIXED.has(r.slug));

  // Deterministic, explicitly bounded sample.
  const rng = mulberry32(seed);
  const shuffled = [...pool].sort(() => rng() - 0.5);
  const sample = shuffled.slice(0, run.limit);
  const detailsCalls = sample.filter((row) =>
    Boolean(row.google_place_id && CHIJ_RE.test(row.google_place_id)),
  ).length;
  const searchCalls = sample.length - detailsCalls;

  console.log("\nDFP address sample audit");
  console.log(`Mode: ${run.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Seed: ${seed}`);
  console.log(`Hard request ceiling: ${run.limit}`);
  console.log(
    googleCostPreview({
      calls: detailsCalls,
      pricePerThousandUsd: 25,
      sku: "Place Details Enterprise + Atmosphere",
    }),
  );
  console.log(
    googleCostPreview({
      calls: searchCalls,
      pricePerThousandUsd: 40,
      sku: "Text Search Enterprise + Atmosphere",
    }),
  );
  if (run.dryRun) {
    console.log("DRY RUN — no API calls and no files changed.");
    console.log(
      "Add --live --confirm --limit N after reviewing the request ceiling.\n",
    );
    return;
  }
  if (!googlePlacesConfigured()) {
    console.error("GOOGLE_PLACES_API_KEY missing — aborting (no spend).");
    process.exit(1);
  }

  const rows: Array<Record<string, unknown>> = [];
  let agree = 0;
  let disagree = 0;
  let noResult = 0;

  const callBudget = createManualGoogleCallBudget(run.limit);
  for (let i = 0; i < sample.length; i++) {
    if (!callBudget.reserve()) break;
    const r = sample[i];
    process.stdout.write(`[${i + 1}/${sample.length}] ${r.slug.padEnd(40).slice(0, 40)} `);
    const enr =
      r.google_place_id && CHIJ_RE.test(r.google_place_id)
        ? await getPlaceDetails(r.google_place_id, "lean")
        : await resolveAndEnrich({
            name: r.name,
            address: r.address ? `${r.address}, Frederick, MD` : "Frederick, MD",
            lat: r.geom?.lat,
            lng: r.geom?.lng,
          }, "lean");

    if (!enr || !enr.formatted_address) {
      console.log("no result");
      noResult++;
      rows.push({
        slug: r.slug,
        name: r.name,
        dfp_address: r.address,
        google_address: null,
        verdict: "no_result",
      });
      continue;
    }

    const dfpPrefix = streetPrefix(r.address);
    const gPrefix = streetPrefix(enr.formatted_address);
    const textAgree = dfpPrefix && gPrefix && dfpPrefix === gPrefix;
    const geomAgree =
      r.geom &&
      enr.lat != null &&
      enr.lng != null &&
      haversineMeters(r.geom, { lat: enr.lat, lng: enr.lng }) <= 150;
    const verdict = textAgree || geomAgree ? "agree" : "disagree";
    if (verdict === "agree") agree++;
    else disagree++;
    console.log(
      `${verdict.padEnd(9)} | dfp="${r.address}" | google="${enr.formatted_address}"`,
    );
    rows.push({
      slug: r.slug,
      name: r.name,
      dfp_address: r.address,
      dfp_geom: r.geom,
      google_place_id_field: r.google_place_id,
      google_address: enr.formatted_address,
      google_lat: enr.lat,
      google_lng: enr.lng,
      google_status: enr.business_status,
      google_display_name: enr.display_name,
      text_agree: textAgree,
      geom_agree_150m: geomAgree,
      verdict,
    });
  }

  const total = sample.length;
  const compared = agree + disagree;
  const rate = compared > 0 ? disagree / compared : 0;
  const summary = {
    seed,
    sample_size: total,
    agree,
    disagree,
    no_result: noResult,
    disagreement_rate_pct: Number((rate * 100).toFixed(1)),
    threshold_pct: 5,
    breach: rate > 0.05,
  };
  console.log("\n=== summary ===");
  console.log(JSON.stringify(summary, null, 2));
  writeFileSync(
    resolve("audit/dfp-sample-50.json"),
    JSON.stringify({ summary, rows }, null, 2),
  );
  console.log("wrote audit/dfp-sample-50.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
