/**
 * Follow-up text searches for the 5 ambiguous records from the
 * initial audit pass (Stern Group, New Horizon Title, Creekside
 * House, Ben & Jerry's, Rick Ridgely). Unbiased search to confirm
 * whether the bias-circle pulled an unrelated business.
 *
 * Plan: npm exec tsx scripts/audit-dfp-mash-followup.ts
 * Live: GOOGLE_PLACES_API_KEY=... npm exec tsx scripts/audit-dfp-mash-followup.ts -- --live --confirm --limit 9
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveAndEnrich, googlePlacesConfigured } from "@/lib/integrations/google-places";
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

const QUERIES = [
  { slug: "the-stern-group", name: "The Stern Group Frederick MD" },
  { slug: "the-stern-group", name: "Stern Group financial advisor Frederick MD" },
  { slug: "new-horizon-title", name: "New Horizon Title Frederick MD" },
  { slug: "creekside-house", name: "Creekside House vacation rental Frederick MD" },
  { slug: "creekside-house", name: "Creekside House 24 S Court Street Frederick MD" },
  { slug: "ben-jerrys-14", name: "Ben & Jerry's Frederick MD" },
  { slug: "ben-jerrys-14", name: "Ben Jerry's ice cream 30 N Market St Frederick" },
  { slug: "rick-ridgely-allstate-insurance", name: "Rick Ridgely Allstate Frederick MD" },
  { slug: "rick-ridgely-allstate-insurance", name: "Rick Ridgely Insurance Frederick Maryland" },
];

async function main() {
  const args = process.argv.slice(2);
  assertManualGoogleArgs(args);
  const run = parseManualGoogleRun(args, {
    defaultLimit: QUERIES.length,
    maxLimit: QUERIES.length,
  });
  const batch = QUERIES.slice(0, run.limit);
  console.log("\nDFP mash follow-up audit");
  console.log(`Mode: ${run.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Hard request ceiling: ${run.limit}`);
  console.log(
    googleCostPreview({
      calls: batch.length,
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
  const callBudget = createManualGoogleCallBudget(run.limit);
  const out: Array<Record<string, unknown>> = [];
  for (const q of batch) {
    if (!callBudget.reserve()) break;
    const enr = await resolveAndEnrich({ name: q.name }, "lean");
    console.log(
      `${q.slug.padEnd(40)} "${q.name}" → ${enr?.display_name ?? "(no result)"} | ${enr?.formatted_address ?? ""} | status=${enr?.business_status ?? "?"}`,
    );
    out.push({
      slug: q.slug,
      query: q.name,
      display_name: enr?.display_name,
      formatted_address: enr?.formatted_address,
      business_status: enr?.business_status,
      website: enr?.website,
      lat: enr?.lat,
      lng: enr?.lng,
      primary_type: enr?.primary_type,
      google_place_id: enr?.google_place_id,
    });
  }
  writeFileSync(
    resolve("audit/dfp-mash-followup.json"),
    JSON.stringify(out, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
