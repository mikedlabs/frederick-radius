/**
 * enrich-amenities.ts — fetch STRUCTURED amenities from Google Places v1.
 *
 * WHY: the stored enrichment carries no amenity attributes, so the app's
 * amenity facets (Outdoor Seating, Dog Friendly, Reservations, Live Music,
 * Good for Groups, Takeout/Delivery, Kid Friendly, Restroom — all already in
 * src/data/tags.ts) have nothing to filter on. This pulls Google's
 * affirmative amenity booleans per place into src/data/places-amenities.json,
 * which src/lib/loaders/placeAmenities.ts maps to those tag slugs so the
 * existing facet UI lights up.
 *
 * COST: amenity fields are the Places "Enterprise + Atmosphere" SKU. One Place
 * Details call is made per selected place. The script is dry-run by default,
 * prints the exact request ceiling and current list-price exposure, and only
 * spends with `--live --confirm --limit N`. It MERGES into the existing file
 * and is resumable, so each reviewed batch advances through the backlog.
 *
 * RUN:
 *   vercel env pull .env.local        # needs GOOGLE_PLACES_API_KEY
 *   npm run enrich:amenities          # dry-run; defaults to a 100-call preview
 *   npm run enrich:amenities -- 200   # legacy dry-run limit remains supported
 *   npm run enrich:amenities -- --live --confirm --limit 100
 * Then: npm run build:client-places   # so map/search pick up the new tags
 *
 * HONESTY: only fields Google returns TRUE are stored. A missing field means
 * "unknown," never "no" — we never assert an amenity Google didn't confirm.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { AMENITY_FIELDS } from "../src/lib/loaders/placeAmenities";
import CLIENT_PLACES from "@/data/places-client.json" with { type: "json" };
import {
  assertManualGoogleArgs,
  googleCostPreview,
  parseManualGoogleRun,
} from "./lib/manual-google-run";

const ENRICHMENT_PATH = resolve(process.cwd(), "src/data/places-enrichment.json");
const OUT = resolve(process.cwd(), "src/data/places-amenities.json");

type EnrichRow = { google_place_id?: string; display_name?: string };
type AmenityRecord = Record<string, boolean>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchAmenities(placeId: string, key: string): Promise<AmenityRecord | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": AMENITY_FIELDS.join(","),
    },
  });
  if (!res.ok) {
    console.warn(`  ! ${placeId}: HTTP ${res.status}`);
    return null;
  }
  const data = (await res.json()) as Record<string, unknown>;
  // Keep only fields Google affirmatively reports true (honesty rule).
  const rec: AmenityRecord = {};
  for (const f of AMENITY_FIELDS) {
    if (data[f] === true) rec[f] = true;
  }
  return rec;
}

async function main() {
  const args = process.argv.slice(2);
  assertManualGoogleArgs(args, { maxPositionals: 1 });
  const legacyLimit = args[0] && !args[0].startsWith("--")
    ? args[0]
    : undefined;
  const run = parseManualGoogleRun(args, {
    defaultLimit: 100,
    maxLimit: 500,
    ...(legacyLimit ? { legacyLimit } : {}),
  });

  const enrichment = JSON.parse(readFileSync(ENRICHMENT_PATH, "utf8")) as Record<string, EnrichRow>;
  const existing: Record<string, AmenityRecord> = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf8"))
    : {};

  // The client artifact is the canonical county-gated public set. Legacy
  // enrichment rows outside it remain untouched instead of spending another
  // paid Details call on a place the app cannot publish.
  const publicSlugs = new Set(
    (CLIENT_PLACES as Array<{ slug: string }>).map((place) => place.slug),
  );
  const targets = Object.entries(enrichment)
    .filter(
      ([slug, r]) =>
        publicSlugs.has(slug) &&
        r.google_place_id &&
        /^ChIJ/.test(r.google_place_id) &&
        !existing[slug],
    )
    .slice(0, run.limit);

  console.log(`enrich:amenities — ${targets.length} place(s) selected (${Object.keys(existing).length} already done)`);
  console.log(`Mode: ${run.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Hard request ceiling: ${run.limit}`);
  console.log(googleCostPreview({
    calls: targets.length,
    pricePerThousandUsd: 25,
    sku: "Place Details Enterprise + Atmosphere",
  }));
  if (targets.length === 0) return;
  if (run.dryRun) {
    console.log("No Google API calls or output-file changes from this script.");
    console.log(
      `First ${Math.min(25, targets.length)} candidates: ${targets
        .slice(0, 25)
        .map(([slug]) => slug)
        .join(", ")}`,
    );
    console.log(
      "Run with --live --confirm --limit N after reviewing this batch.",
    );
    return;
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY not set. Run: vercel env pull .env.local",
    );
  }

  let done = 0;
  for (const [slug, row] of targets) {
    try {
      const rec = await fetchAmenities(row.google_place_id!, key);
      if (rec) existing[slug] = rec; // store even when empty: "fetched, nothing true"
    } catch (err) {
      console.warn(`  ! ${slug}: ${(err as Error).message}`);
    }
    done++;
    if (done % 25 === 0) {
      writeFileSync(OUT, JSON.stringify(existing, null, 0)); // checkpoint (resumable)
      console.log(`  …${done}/${targets.length}`);
    }
    await sleep(120); // gentle throttle
  }

  writeFileSync(OUT, JSON.stringify(existing, null, 0));
  const withAny = Object.values(existing).filter((r) => Object.keys(r).length > 0).length;
  console.log(`wrote ${OUT} — ${Object.keys(existing).length} places, ${withAny} with >=1 amenity`);
  console.log("Next: npm run build:client-places");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
