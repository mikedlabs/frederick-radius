/**
 * Refreshes a rotating, request-capped batch of business statuses from Google
 * Place Details and merges it into src/data/business-status.json.
 *
 * PAID. Each target costs one status-only Place Details call. The command is
 * dry-run by default. A paid batch requires `--live --confirm --limit N`; the
 * immutable per-run maximum remains 500 requests. Over roughly two weeks,
 * reviewed 100-request batches cover the canonical pre-status identity
 * catalog without repeatedly paying to refresh every row.
 *
 * Serverless storage is read-only at request time, so this is a local or
 * CI script (the pattern used by dedup and copy:scores), not a runtime
 * writer. The loader applies the provider result after exact, reviewed manual
 * status evidence. Manual closures stay suppressed; operational corrections
 * remain refreshable so the provider can eventually repair a false closure.
 *
 * Preview: npm run refresh:business-status -- --limit 100
 * Live: GOOGLE_PLACES_API_KEY=... npm run refresh:business-status -- --live --confirm --limit 100
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getPlaceDetails,
  googlePlacesConfigured,
  googleStatusToOperational,
} from "@/lib/integrations/google-places";
import { isGooglePlaceId } from "@/lib/provenance";
import {
  selectRotatingStatusTargets,
  type BusinessStatusRefreshEntry,
} from "@/lib/business-status-refresh";
import { placeRefreshIdentities } from "@/lib/loaders/placeRefreshIdentities";
import { findGooglePlaceIdCollisions } from "@/lib/quality/enrichmentBinding";
import {
  assertManualGoogleArgs,
  googleCostPreview,
  parseManualGoogleRun,
} from "./lib/manual-google-run";

const OUT = resolve("src/data/business-status.json");

async function main() {
  const args = process.argv.slice(2);
  assertManualGoogleArgs(args);
  const run = parseManualGoogleRun(args, {
    defaultLimit: 100,
    maxLimit: 500,
  });
  const allTargets = placeRefreshIdentities()
    .filter((place) => isGooglePlaceId(place.google_place_id))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const identityCollisions = findGooglePlaceIdCollisions(allTargets);
  if (identityCollisions.length > 0) {
    throw new Error(
      `Refusing paid business-status calls for duplicate provider identities:\n${identityCollisions
        .map(({ googlePlaceId, slugs }) => `${googlePlaceId}: ${slugs.join(", ")}`)
        .join("\n")}`,
    );
  }
  const cycleDay = Math.floor(Date.now() / 86_400_000);
  const targets = selectRotatingStatusTargets(
    allTargets,
    Math.min(run.limit, allTargets.length),
    cycleDay,
  );
  console.log("\nGoogle business-status refresh");
  console.log(`Mode: ${run.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Eligible canonical identities: ${allTargets.length}`);
  console.log(`Hard request ceiling: ${run.limit}`);
  console.log(`This rotating batch: ${targets.length}`);
  console.log(googleCostPreview({
    calls: targets.length,
    pricePerThousandUsd: 17,
    sku: "Place Details Pro",
  }));
  if (run.dryRun) {
    console.log("No Google API calls or business-status output changes from this script.");
    console.log(
      `First ${Math.min(25, targets.length)} candidates: ${targets
        .slice(0, 25)
        .map((target) => target.slug)
        .join(", ") || "none"}`,
    );
    console.log(
      "Run with --live --confirm --limit N after reviewing this batch.\n",
    );
    return;
  }
  if (!googlePlacesConfigured()) {
    throw new Error("GOOGLE_PLACES_API_KEY is not set. Aborting (no spend).");
  }

  const previous = JSON.parse(readFileSync(OUT, "utf8")) as {
    overrides?: Record<string, BusinessStatusRefreshEntry>;
  };
  const overrides: Record<string, BusinessStatusRefreshEntry> = {
    ...(previous.overrides ?? {}),
  };
  console.log(`Refreshing ${targets.length} status-only place details.`);

  let calls = 0;
  let updated = 0;

  for (const p of targets) {
    const details = await getPlaceDetails(
      p.google_place_id as string,
      "status",
    );
    calls++;
    if (!details) continue;
    const status = googleStatusToOperational(details.business_status);
    // UNKNOWN is not evidence that a prior closed/open verdict changed.
    if (status === "needs_verification") continue;
    overrides[p.slug] = {
      place_id: p.google_place_id as string,
      is_operational: status,
      refreshed_at: new Date().toISOString(),
    };
    updated++;
    await new Promise((done) => setTimeout(done, 60));
  }

  if (targets.length > 0 && updated === 0) {
    throw new Error(
      `Google returned no usable business-status rows for ${targets.length} requests; keeping the previous snapshot unchanged.`,
    );
  }

  const out = {
    _doc:
      "Latest Google business-status checks, bound by place_id to the canonical pre-business-status identity artifact. The canonical place loader applies matching rows after manual safety overrides and reconciles them with the rolling hours refresh by refreshed_at.",
    generated_at: new Date().toISOString(),
    api_calls: calls,
    last_batch_updated: updated,
    cycle_day: cycleDay,
    catalog_targets: allTargets.length,
    count: Object.keys(overrides).length,
    overrides,
  };
  writeFileSync(
    OUT,
    JSON.stringify(out, null, 2) + "\n",
  );
  console.log(
    `Made ${calls} status-only calls; updated ${updated}; retained ${Object.keys(overrides).length} checked rows.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
