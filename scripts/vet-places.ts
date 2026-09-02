/**
 * Place vetting sweep — pulls fresh Google Place Details for every
 * row in places-enrichment.json and diffs against the stored data
 * so the editor can see what changed: business closed, hours moved,
 * website went dead, phone changed, rating swung.
 *
 * DRY RUN BY DEFAULT, exactly like `npm run discover`. Cost is
 * documented up-front; `--live --confirm --limit N` actually calls. Writes a REVIEW artifact only —
 * NEVER mutates places-enrichment.json. The owner reviews drift in
 * /admin/drift-review (dev) and decides what to accept.
 *
 *   npm run vet                              # dry run, $0
 *   npm run vet -- --live --confirm --limit 100
 *   npm run vet -- --limit 50                # plan only the first N rows
 *
 * Pricing (2026-08): Place Details, our lean field mask includes
 * editorialSummary and therefore reaches Enterprise + Atmosphere at
 * $25.00 / 1,000. The script prints list-price exposure without assuming
 * that a free allowance is still unused.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getPlaceDetails } from "@/lib/integrations/google-places";
import { PLACE_BY_SLUG } from "@/data/places";
import { isValidCoord } from "@/lib/geo";
import {
  assertManualGoogleArgs,
  createManualGoogleCallBudget,
  googleCostPreview,
  parseManualGoogleRun,
  selectRotatingManualBatch,
} from "./lib/manual-google-run";

const ENRICHMENT_PATH = path.join(process.cwd(), "src/data/places-enrichment.json");
const DRIFT_DIR = path.join(process.cwd(), "data");
const DRIFT_PATH = path.join(DRIFT_DIR, "place-drift.json");

type Enriched = {
  google_place_id: string;
  business_status?: string;
  weekday_hours?: string[];
  has_hours?: boolean;
  rating?: number;
  user_rating_count?: number;
  phone?: string;
  website?: string;
  display_name?: string;
  formatted_address?: string;
};

type DriftField =
  | "business_status"
  | "name"
  | "phone"
  | "website"
  | "hours"
  | "rating"
  | "address";

type DriftRow = {
  slug: string;
  google_place_id: string;
  detected_at: string;
  changes: Array<{
    field: DriftField;
    before: string | number | null;
    after: string | number | null;
  }>;
};

type DriftFile = {
  generated_at: string;
  total_checked: number;
  drift_count: number;
  rows: DriftRow[];
};

/** Cheap deep-equal for our tiny shapes — hours arrays are short and
 *  primitive, so JSON.stringify is sufficient and avoids a dep. */
function eqHours(a?: string[], b?: string[]): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

async function main() {
  const args = process.argv.slice(2);
  assertManualGoogleArgs(args);
  const run = parseManualGoogleRun(args, {
    defaultLimit: 100,
    maxLimit: 500,
  });
  const enrichment = JSON.parse(readFileSync(ENRICHMENT_PATH, "utf8")) as Record<string, Enriched>;
  const rejectedPlacement = Object.keys(enrichment).filter((slug) => {
    const place = PLACE_BY_SLUG[slug];
    return !place || !isValidCoord(place.geom);
  });
  const allSlugs = Object.keys(enrichment).filter((slug) => {
    const place = PLACE_BY_SLUG[slug];
    return enrichment[slug].google_place_id && place && isValidCoord(place.geom);
  });

  const now = new Date();
  const cycle = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const selection = selectRotatingManualBatch(allSlugs, run.limit, cycle);
  const targets = selection.items;

  console.log(`\n  Place vetting — Google Place Details refresh`);
  console.log("  ---------------------------------------------");
  console.log(`  Eligible rows         ${allSlugs.length}`);
  console.log(`  Selected              ${targets.length}`);
  console.log(`  Monthly rotation      offset ${selection.offset}`);
  console.log(`  Details calls         ${targets.length}`);
  console.log(`  Hard request ceiling  ${run.limit}`);
  console.log(
    `  ${googleCostPreview({
      calls: targets.length,
      pricePerThousandUsd: 25,
      sku: "Place Details Enterprise + Atmosphere",
    })}`,
  );
  if (rejectedPlacement.length > 0) {
    console.log(
      `  Placement rejects     ${rejectedPlacement.length} (retained in source data; no paid call)`,
    );
  }

  if (run.dryRun) {
    console.log("\n  DRY RUN — nothing was called, $0 spent.");
    console.log("  To execute: npm run vet -- --live --confirm --limit N\n");
    return;
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log("\n  GOOGLE_PLACES_API_KEY not set. Aborted, $0 spent.\n");
    process.exit(1);
  }

  console.log("\n  LIVE — fetching…");

  const drift: DriftRow[] = [];
  let calls = 0;
  const callBudget = createManualGoogleCallBudget(run.limit);
  for (const slug of targets) {
    if (!callBudget.reserve()) break;
    const stored = enrichment[slug];
    const id = stored.google_place_id;
    const fresh = await getPlaceDetails(id, "lean");
    calls += 1;
    if (!fresh) continue;
    const changes: DriftRow["changes"] = [];

    if ((fresh.business_status ?? null) !== (stored.business_status ?? null)) {
      changes.push({
        field: "business_status",
        before: stored.business_status ?? null,
        after: fresh.business_status ?? null,
      });
    }
    if (fresh.display_name && fresh.display_name !== stored.display_name) {
      changes.push({
        field: "name",
        before: stored.display_name ?? null,
        after: fresh.display_name,
      });
    }
    if ((fresh.phone ?? null) !== (stored.phone ?? null)) {
      changes.push({
        field: "phone",
        before: stored.phone ?? null,
        after: fresh.phone ?? null,
      });
    }
    if ((fresh.website ?? null) !== (stored.website ?? null)) {
      changes.push({
        field: "website",
        before: stored.website ?? null,
        after: fresh.website ?? null,
      });
    }
    if (!eqHours(fresh.weekday_hours, stored.weekday_hours)) {
      changes.push({
        field: "hours",
        before: (stored.weekday_hours ?? []).join(" · ") || null,
        after: (fresh.weekday_hours ?? []).join(" · ") || null,
      });
    }
    // Only flag rating swing > 0.3 — typical week-to-week noise.
    if (
      fresh.rating !== undefined &&
      stored.rating !== undefined &&
      Math.abs(fresh.rating - stored.rating) >= 0.3
    ) {
      changes.push({
        field: "rating",
        before: stored.rating,
        after: fresh.rating,
      });
    }
    if (fresh.formatted_address && fresh.formatted_address !== stored.formatted_address) {
      changes.push({
        field: "address",
        before: stored.formatted_address ?? null,
        after: fresh.formatted_address,
      });
    }

    if (changes.length > 0) {
      drift.push({
        slug,
        google_place_id: id,
        detected_at: new Date().toISOString(),
        changes,
      });
    }
  }

  if (!existsSync(DRIFT_DIR)) mkdirSync(DRIFT_DIR, { recursive: true });
  const out: DriftFile = {
    generated_at: new Date().toISOString(),
    total_checked: calls,
    drift_count: drift.length,
    rows: drift,
  };
  writeFileSync(DRIFT_PATH, JSON.stringify(out, null, 2));

  console.log(`\n  Checked ${calls} places.`);
  console.log(`  Found drift in ${drift.length} (${((drift.length / Math.max(1, calls)) * 100).toFixed(1)}%).`);
  console.log(`  Wrote ${DRIFT_PATH}`);
  console.log("  Review at /admin/drift-review (dev). Nothing in src/data was changed.\n");
}

main().catch((e) => {
  console.error("vet-places failed:", e);
  process.exit(1);
});
