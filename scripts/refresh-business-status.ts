/**
 * Refreshes business status for curated places from Google Place Details
 * and writes the committed override artifact src/data/business-status.json.
 *
 * PAID. Each curated place with a google_place_id costs one Place Details
 * call (field mask id,businessStatus,displayName). Roughly tens of dollars
 * one-time for the full catalog, then far less on the staggered cron. Do
 * not run casually. Cost is documented in README.md.
 *
 * Serverless storage is read-only at request time, so this is a local or
 * CI script (the pattern used by dedup and copy:scores), not a runtime
 * writer. The loader applies the override; isOperational then suppresses
 * anything Google reports closed.
 *
 * Usage: GOOGLE_PLACES_API_KEY=... npm run refresh:business-status
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLACES } from "@/data/places";
import {
  getPlaceDetails,
  googlePlacesConfigured,
  googleStatusToOperational,
} from "@/lib/integrations/google-places";

async function main() {
  if (!googlePlacesConfigured()) {
    console.error("GOOGLE_PLACES_API_KEY is not set. Aborting (no spend).");
    process.exit(1);
  }

  const targets = PLACES.filter((p) => p.google_place_id);
  console.log(`Refreshing business status for ${targets.length} curated places with a place id.`);

  const overrides: Record<string, { is_operational: string; refreshed_at: string }> = {};
  let calls = 0;

  for (const p of targets) {
    const details = await getPlaceDetails(p.google_place_id as string);
    calls++;
    if (!details) continue;
    overrides[p.slug] = {
      is_operational: googleStatusToOperational(details.business_status),
      refreshed_at: new Date().toISOString(),
    };
  }

  const out = {
    generated_at: new Date().toISOString(),
    api_calls: calls,
    count: Object.keys(overrides).length,
    overrides,
  };
  writeFileSync(
    resolve("src/data/business-status.json"),
    JSON.stringify(out, null, 2) + "\n",
  );
  console.log(`Made ${calls} Google Place Details calls. Wrote src/data/business-status.json.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
