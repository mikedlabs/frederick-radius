/**
 * Backfill exact Google photo attribution metadata without paying for a full
 * place-enrichment sweep.
 *
 * The legacy dataset contains photo resource names but predates the Places
 * API fields that pair each resource with its individual Google Maps source
 * and author attribution. Radius correctly suppresses those unpaired images,
 * which currently leaves business cards without thumbnails. This script uses
 * the narrow `photos` field set and merges ONLY photo fields into the existing
 * row.
 *
 * Dry-run by default:
 *   npm run backfill:photo-attributions
 *   npm run backfill:photo-attributions -- --limit 100 --live --confirm
 *
 * `--limit` is a hard request ceiling, not a projection. Every successful run
 * removes those rows from the next batch, so repeated reviewed runs advance
 * through the backlog without a cursor file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import CLIENT_PLACES from "@/data/places-client.json" with { type: "json" };
import { getPlaceDetails } from "@/lib/integrations/google-places";
import {
  mergeGooglePhotoMetadata,
  needsGooglePhotoMetadata,
  type PhotoBackfillRow,
} from "@/lib/google-photo-backfill";

const OUT = new URL(
  "../src/data/places-enrichment.json",
  import.meta.url,
).pathname;

type ClientPriority = {
  slug: string;
  feature_score?: number;
  local_favorite?: boolean;
  google_rating_count?: number;
};

function numberArg(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

async function main() {
  const live =
    process.argv.includes("--live") && process.argv.includes("--confirm");
  const limit = Math.min(numberArg("--limit", 100), 500);
  const existing = JSON.parse(
    readFileSync(OUT, "utf8"),
  ) as Record<string, PhotoBackfillRow>;
  const publicPriority = new Map(
    (CLIENT_PLACES as ClientPriority[]).map((place) => [
      place.slug,
      (place.local_favorite ? 10_000 : 0) +
        (place.feature_score ?? 0) * 100 +
        Math.log10((place.google_rating_count ?? 0) + 1),
    ]),
  );
  const candidates = Object.entries(existing)
    // places-client is the county-gated public artifact. Legacy enrichment
    // rows outside that set remain untouched rather than generating paid calls.
    .filter(([slug, row]) => publicPriority.has(slug) && needsGooglePhotoMetadata(row))
    .sort(
      ([slugA], [slugB]) =>
        (publicPriority.get(slugB) ?? -1) -
          (publicPriority.get(slugA) ?? -1) ||
        slugA.localeCompare(slugB),
    );
  const batch = candidates.slice(0, limit);

  console.log("\nGoogle photo attribution backfill");
  console.log(`Eligible legacy rows: ${candidates.length}`);
  console.log(`Hard request ceiling: ${limit}`);
  console.log(`This batch: ${batch.length}`);
  if (!live) {
    console.log("DRY RUN — no API calls and no files changed.");
    console.log(
      "Add --live --confirm after reviewing the request ceiling.\n",
    );
    return;
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY is required for a live run.");
  }

  const output = { ...existing };
  let updated = 0;
  let missing = 0;
  let unusable = 0;
  for (let index = 0; index < batch.length; index++) {
    const [slug, row] = batch[index];
    const details = await getPlaceDetails(row.google_place_id!, "photos");
    if (!details) {
      missing++;
    } else if (
      details.photo_names.length === 0 ||
      details.photo_attributions.length === 0
    ) {
      unusable++;
    } else {
      output[slug] = mergeGooglePhotoMetadata(
        row,
        details,
        new Date().toISOString(),
      );
      updated++;
    }
    if ((index + 1) % 20 === 0 || index === batch.length - 1) {
      console.log(
        `${index + 1}/${batch.length} · updated:${updated} · unavailable:${missing} · unpaired:${unusable}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  writeFileSync(OUT, JSON.stringify(output));
  console.log(`Wrote ${updated} updated rows to ${OUT}.`);
  console.log(
    "Run npm run build:client-places, review the diff, then deploy.\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
