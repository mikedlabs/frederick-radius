/**
 * Refreshes a rotating, request-capped batch of business statuses from Google
 * Place Details and merges it into src/data/business-status.json.
 *
 * PAID. Each target costs one status-only Place Details call. The default
 * ceiling is 100 requests; over roughly two weeks the nightly data steward
 * covers the current catalog without repeatedly paying to refresh every row
 * every night. `--limit` is a hard request ceiling (max 500).
 *
 * Serverless storage is read-only at request time, so this is a local or
 * CI script (the pattern used by dedup and copy:scores), not a runtime
 * writer. The loader applies the override; isOperational then suppresses
 * anything Google reports closed.
 *
 * Usage: GOOGLE_PLACES_API_KEY=... npm run refresh:business-status -- --limit 100
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidCoord } from "@/lib/geo";
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
import {
  canonicalBusinessStatusRefreshCandidates,
  decoratePlace,
} from "@/lib/loaders/places";
import { findGooglePlaceIdCollisions } from "@/lib/quality/enrichmentBinding";

const OUT = resolve("src/data/business-status.json");

function requestLimit(): number {
  const index = process.argv.indexOf("--limit");
  const parsed = index >= 0 ? Number(process.argv[index + 1]) : 100;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new Error("--limit must be an integer between 1 and 500.");
  }
  return parsed;
}

async function main() {
  if (!googlePlacesConfigured()) {
    console.error("GOOGLE_PLACES_API_KEY is not set. Aborting (no spend).");
    process.exit(1);
  }

  const limit = requestLimit();
  const allTargets = canonicalBusinessStatusRefreshCandidates()
    .map((place) => decoratePlace(place))
    .filter(
      (place) =>
        isValidCoord(place.geom) &&
        isGooglePlaceId(place.google_place_id),
    )
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
    Math.min(limit, allTargets.length),
    cycleDay,
  );
  const previous = JSON.parse(readFileSync(OUT, "utf8")) as {
    overrides?: Record<string, BusinessStatusRefreshEntry>;
  };
  const overrides: Record<string, BusinessStatusRefreshEntry> = {
    ...(previous.overrides ?? {}),
  };
  console.log(
    `Refreshing ${targets.length}/${allTargets.length} business statuses (status-only field mask).`,
  );

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
      "Latest Google business-status checks, bound to the public catalog identity by place_id. The canonical place loader applies matching rows after manual safety overrides and reconciles them with the rolling hours refresh by refreshed_at.",
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
