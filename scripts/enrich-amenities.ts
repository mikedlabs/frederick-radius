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
 * Details call per place with a google_place_id (~1,300 places) ≈ $40–75
 * one-time, depending on your Google pricing. The script prints a projection
 * and asks nothing destructive — it MERGES into the existing file and is
 * resumable, so a re-run only fills gaps.
 *
 * RUN:
 *   vercel env pull .env.local        # needs GOOGLE_PLACES_API_KEY
 *   npm run enrich:amenities          # all places with a place_id
 *   npm run enrich:amenities -- 200   # cap to first 200 (a cheap smoke test)
 * Then: npm run build:client-places   # so map/search pick up the new tags
 *
 * HONESTY: only fields Google returns TRUE are stored. A missing field means
 * "unknown," never "no" — we never assert an amenity Google didn't confirm.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { AMENITY_FIELDS } from "../src/lib/loaders/placeAmenities";
import CLIENT_PLACES from "@/data/places-client.json" with { type: "json" };

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
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    console.error("GOOGLE_PLACES_API_KEY not set. Run: vercel env pull .env.local");
    process.exit(1);
  }

  const enrichment = JSON.parse(readFileSync(ENRICHMENT_PATH, "utf8")) as Record<string, EnrichRow>;
  const existing: Record<string, AmenityRecord> = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf8"))
    : {};

  const cap = Number(process.argv[2]) || Infinity;
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
    .slice(0, cap);

  console.log(`enrich:amenities — ${targets.length} place(s) to fetch (${Object.keys(existing).length} already done)`);
  console.log(`  est. cost: ~$${(targets.length * 0.025).toFixed(2)}–$${(targets.length * 0.05).toFixed(2)} (Enterprise+Atmosphere SKU)`);
  if (targets.length === 0) return;

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
