/**
 * Backfill exact Google photo attribution metadata without paying for a full
 * place-enrichment sweep.
 *
 * The legacy dataset contains photo resource names but predates the Places
 * API fields that pair each resource with its individual Google Maps source
 * and author attribution. Some verified listings have never fetched photo
 * data at all. Radius correctly suppresses unpaired images, which otherwise
 * leaves business cards without thumbnails. This script uses the narrow
 * `photos` field set and merges ONLY photo fields into the existing row.
 *
 * Dry-run by default:
 *   npm run backfill:photo-attributions
 *   npm run backfill:photo-attributions -- --live --confirm --limit 100
 *   npm run backfill:photo-attributions -- --resolve-missing-ids --limit 100
 *   npm run backfill:photo-attributions -- --resolve-missing-ids --live --confirm --limit 100
 *
 * `--limit` is a hard request ceiling, not a projection. Every successful run
 * removes those rows from the next batch, so repeated reviewed runs advance
 * through the backlog without a cursor file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import CLIENT_PLACES from "@/data/places-client.json" with { type: "json" };
import { BREWERIES } from "@/data/beers";
import {
  getPlaceDetails,
  resolveAndEnrich,
} from "@/lib/integrations/google-places";
import {
  mergeGooglePhotoMetadata,
  mergeResolvedGooglePhotoMetadata,
  needsGooglePhotoMetadata,
  type PhotoBackfillRow,
  withCanonicalGooglePlaceId,
} from "@/lib/google-photo-backfill";
import { publishableGooglePhotoNames } from "@/lib/google-photo-policy";
import { isGooglePlaceId } from "@/lib/provenance";
import {
  assertManualGoogleArgs,
  createManualGoogleCallBudget,
  googleCostPreview,
  parseManualGoogleRun,
} from "./lib/manual-google-run";

const OUT = new URL(
  "../src/data/places-enrichment.json",
  import.meta.url,
).pathname;

type ClientPriority = {
  slug: string;
  feature_score?: number;
  local_favorite?: boolean;
  google_rating_count?: number;
  google_place_id?: string;
  google_photo_url?: string;
  name: string;
  address?: string;
  city?: string;
  geom?: { lat: number; lng: number };
};

async function main() {
  const args = process.argv.slice(2);
  assertManualGoogleArgs(args, { booleanFlags: ["--resolve-missing-ids"] });
  const run = parseManualGoogleRun(args, {
    defaultLimit: 100,
    maxLimit: 500,
  });
  const resolveMissingIds = process.argv.includes("--resolve-missing-ids");
  const existing = JSON.parse(
    readFileSync(OUT, "utf8"),
  ) as Record<string, PhotoBackfillRow>;
  const brewerySlugs = new Set(BREWERIES.map((brewery) => brewery.slug));
  const publicPriority = new Map(
    (CLIENT_PLACES as ClientPriority[]).map((place) => [
      place.slug,
      (brewerySlugs.has(place.slug) ? 1_000_000 : 0) +
      (place.local_favorite ? 10_000 : 0) +
        (place.feature_score ?? 0) * 100 +
        Math.log10((place.google_rating_count ?? 0) + 1),
    ]),
  );
  const candidates = (CLIENT_PLACES as ClientPriority[])
    .map((place) => [
      place.slug,
      withCanonicalGooglePlaceId(
        existing[place.slug] ?? {},
        place.google_place_id,
      ),
      place,
    ] as const)
    // places-client is the county-gated public artifact. Legacy enrichment
    // rows outside that set remain untouched rather than generating paid calls.
    .filter(([, row, place]) =>
      resolveMissingIds
        ? !place.google_photo_url &&
          !isGooglePlaceId(row.google_place_id) &&
          Boolean(place.geom)
        : needsGooglePhotoMetadata(row),
    )
    .sort(
      ([slugA], [slugB]) =>
        (publicPriority.get(slugB) ?? -1) -
          (publicPriority.get(slugA) ?? -1) ||
        slugA.localeCompare(slugB),
    );
  const batch = candidates.slice(0, run.limit);

  console.log("\nGoogle photo attribution backfill");
  console.log(
    `Mode: ${resolveMissingIds ? "resolve missing Google identities" : "refresh known Google identities"}`,
  );
  console.log(`Eligible public rows: ${candidates.length}`);
  console.log(`Hard request ceiling: ${run.limit}`);
  console.log(`This batch: ${batch.length}`);
  console.log(
    googleCostPreview({
      calls: batch.length,
      pricePerThousandUsd: resolveMissingIds ? 32 : 0,
      sku: resolveMissingIds
        ? "Text Search Pro"
        : "Place Details IDs Only (photo metadata; photo media not fetched)",
    }),
  );
  if (run.dryRun) {
    console.log("DRY RUN — no API calls and no files changed.");
    console.log(
      `First ${Math.min(25, batch.length)} candidates: ${batch
        .slice(0, 25)
        .map(([slug]) => slug)
        .join(", ") || "none"}`,
    );
    console.log(
      "Add --live --confirm --limit N after reviewing the request ceiling.\n",
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
  const callBudget = createManualGoogleCallBudget(run.limit);
  for (let index = 0; index < batch.length; index++) {
    if (!callBudget.reserve()) break;
    const [slug, row, place] = batch[index];
    const details = resolveMissingIds
      ? await resolveAndEnrich(
          {
            name: place.name,
            address: [place.address, place.city, "MD"]
              .filter(Boolean)
              .join(", "),
            lat: place.geom?.lat,
            lng: place.geom?.lng,
          },
          "photo-resolve",
        )
      : await getPlaceDetails(row.google_place_id!, "photos");
    const publishable = details
      ? publishableGooglePhotoNames(
          details.photo_names,
          details.photo_attributions,
        )
      : [];
    if (!details) {
      missing++;
    } else if (publishable.length === 0) {
      unusable++;
    } else {
      const refreshedAt = new Date().toISOString();
      output[slug] = resolveMissingIds
        ? mergeResolvedGooglePhotoMetadata(row, details, refreshedAt)
        : mergeGooglePhotoMetadata(row, details, refreshedAt);
      updated++;
    }
    if ((index + 1) % 20 === 0 || index === batch.length - 1) {
      console.log(
        `${index + 1}/${batch.length} · updated:${updated} · unavailable:${missing} · unpaired:${unusable}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  writeFileSync(OUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${updated} updated rows to ${OUT}.`);
  console.log(
    "Run npm run build:client-places, review the diff, then deploy.\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
