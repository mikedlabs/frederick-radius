/**
 * One-off audit: verify the 17 "blurb-mash" records flagged after the
 * Spinners Pinball fix (commit 75ae6d3) against Google Places.
 *
 * Most of the 17 records carry placeholder UUIDs in `google_place_id`
 * rather than real `ChIJ…` IDs, so we resolve by Text Search biased on
 * the existing geom. Read-only — emits JSON to audit/dfp-mash-verification.json.
 *
 * Run: GOOGLE_PLACES_API_KEY=... npm exec tsx scripts/audit-dfp-mash.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getPlaceDetails,
  googlePlacesConfigured,
  resolveAndEnrich,
  type PlaceEnrichment,
} from "@/lib/integrations/google-places";

// Lightweight .env.local loader — refresh-business-status relies on the
// shell, but we want this script runnable with a plain `tsx` invocation.
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
  } catch {
    // best-effort
  }
}
loadEnvLocal();

type DfpRow = {
  slug: string;
  name: string;
  short_blurb?: string;
  address?: string;
  postal_code?: string | number;
  geom?: { lat: number; lng: number };
  google_place_id?: string;
  website?: string;
};

const TARGETS = [
  "tony-little-jane-moore-real-estate-teams-llc",
  "the-stern-group",
  "trina-wagner",
  "eagles-aeire-1067",
  "new-horizon-title",
  "creekside-house",
  "george-mason-mortgage-llc",
  "the-poole-law-group",
  "schley-park",
  "ben-jerrys-14",
  "creekside-plaza-llc",
  "emily-d-gordon-advanced-rolfer",
  "gabe-fortmann-academy-mortgage",
  "green-advantage",
  "harmon-field",
  "rick-ridgely-allstate-insurance",
  "elliott",
];

const CHIJ_RE = /^ChIJ[A-Za-z0-9_-]+$/;

async function verify(row: DfpRow): Promise<PlaceEnrichment | null> {
  if (row.google_place_id && CHIJ_RE.test(row.google_place_id)) {
    return getPlaceDetails(row.google_place_id);
  }
  return resolveAndEnrich({
    name: row.name,
    address: row.address ? `${row.address}, Frederick, MD` : "Frederick, MD",
    lat: row.geom?.lat,
    lng: row.geom?.lng,
  });
}

async function main() {
  if (!googlePlacesConfigured()) {
    console.error("GOOGLE_PLACES_API_KEY missing — aborting (no spend).");
    process.exit(1);
  }
  const dfp = JSON.parse(
    readFileSync(resolve("src/data/places-dfp.json"), "utf8"),
  ) as DfpRow[];
  const bySlug = new Map(dfp.map((r) => [r.slug, r]));
  const results: Array<{
    slug: string;
    name: string;
    current_address?: string;
    current_postal?: string | number;
    current_geom?: { lat: number; lng: number };
    google_place_id_field: string | undefined;
    google_resolved_id?: string;
    google_address?: string;
    google_lat?: number;
    google_lng?: number;
    google_status?: string;
    google_primary_type?: string;
    google_website?: string;
    google_display_name?: string;
    notes?: string;
  }> = [];
  for (const slug of TARGETS) {
    const row = bySlug.get(slug);
    if (!row) {
      results.push({
        slug,
        name: "[NOT FOUND IN DFP]",
        google_place_id_field: undefined,
        notes: "missing",
      });
      continue;
    }
    process.stdout.write(`→ ${slug} … `);
    const enr = await verify(row);
    if (!enr) {
      console.log("no Google result");
      results.push({
        slug,
        name: row.name,
        current_address: row.address,
        current_postal: row.postal_code,
        current_geom: row.geom,
        google_place_id_field: row.google_place_id,
        notes: "no Google result",
      });
      continue;
    }
    console.log(`${enr.business_status} ${enr.formatted_address}`);
    results.push({
      slug,
      name: row.name,
      current_address: row.address,
      current_postal: row.postal_code,
      current_geom: row.geom,
      google_place_id_field: row.google_place_id,
      google_resolved_id: enr.google_place_id,
      google_address: enr.formatted_address,
      google_lat: enr.lat,
      google_lng: enr.lng,
      google_status: enr.business_status,
      google_primary_type: enr.primary_type,
      google_website: enr.website,
      google_display_name: enr.display_name,
    });
  }
  writeFileSync(
    resolve("audit/dfp-mash-verification.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(`\nwrote audit/dfp-mash-verification.json (${results.length} rows)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
