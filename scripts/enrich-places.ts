/**
 * Enrich places with Google Places data.
 *
 *   Curated (default)  → src/data/places-enrichment.json   (~51 places, ~$2)
 *   DFP long-tail       → src/data/dfp-enrichment.json       (~1,280 places, $$)
 *
 * Cost control: curated mode enriches ONLY the editorial places
 * (source !== "dfp"). DFP mode is opt-in via --dfp and is resume-safe so a
 * partial / interrupted run can be continued without re-billing places that
 * already succeeded.
 *
 *   npm run enrich                  # curated only
 *   npm run enrich -- --limit 5     # curated smoke test
 *   npm run enrich -- --all         # curated + DFP into places-enrichment.json
 *   npm run enrich:dfp              # DFP long-tail → dfp-enrichment.json (resumes)
 *   npm run enrich:dfp -- --limit 25  # DFP smoke test
 *   npm run enrich:dfp -- --force   # ignore existing cache, re-fetch all
 *
 * Resolution: google_place_id when present (cheap Place Details), else Text
 * Search by "name, address" biased to the place's coordinates.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { PLACES } from "@/data/places";
import {
  getPlaceDetails,
  resolveAndEnrich,
  type PlaceEnrichment,
} from "@/lib/integrations/google-places";

type DfpRecord = {
  slug: string;
  name: string;
  address?: string;
  city?: string;
  geom?: { lat?: number; lng?: number };
  google_place_id?: string;
};

type Target = {
  slug: string;
  name: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  google_place_id?: string;
};

type EnrichedRow = PlaceEnrichment & { enriched_at: string };

const CURATED_OUT = new URL("../src/data/places-enrichment.json", import.meta.url).pathname;
const DFP_OUT = new URL("../src/data/dfp-enrichment.json", import.meta.url).pathname;
const DFP_SRC = new URL("../src/data/places-dfp.json", import.meta.url).pathname;

function loadExisting(path: string): Record<string, EnrichedRow> {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf8").trim();
    return raw ? (JSON.parse(raw) as Record<string, EnrichedRow>) : {};
  } catch {
    return {};
  }
}

function curatedTargets(includeDfp: boolean): Target[] {
  return PLACES.filter((p) => includeDfp || p.source !== "dfp").map((p) => ({
    slug: p.slug,
    name: p.name,
    address: `${p.address}, ${p.city}, MD`,
    lat: p.geom?.lat,
    lng: p.geom?.lng,
    google_place_id: p.google_place_id,
  }));
}

function dfpTargets(): Target[] {
  const rows = JSON.parse(readFileSync(DFP_SRC, "utf8")) as DfpRecord[];
  return rows.map((p) => ({
    slug: p.slug,
    name: p.name,
    address: [p.address, p.city, "MD"].filter(Boolean).join(", "),
    lat: p.geom?.lat,
    lng: p.geom?.lng,
    google_place_id: p.google_place_id,
  }));
}

async function enrichOne(t: Target): Promise<PlaceEnrichment | null> {
  if (t.google_place_id && /^ChIJ/.test(t.google_place_id)) {
    const byId = await getPlaceDetails(t.google_place_id);
    if (byId) return byId;
    // Stale/invalid id → fall back to text search rather than losing the row.
  }
  return resolveAndEnrich({
    name: t.name,
    address: t.address,
    lat: t.lat,
    lng: t.lng,
  });
}

async function main() {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY not set. Run: vercel env pull .env.local");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dfp = args.includes("--dfp");
  const all = args.includes("--all");
  const force = args.includes("--force");
  const li = args.indexOf("--limit");
  const limit = li >= 0 ? parseInt(args[li + 1], 10) : Infinity;

  const out = dfp ? DFP_OUT : CURATED_OUT;
  const existing = loadExisting(out);

  let targets = dfp ? dfpTargets() : curatedTargets(all);

  // Resume-safe: skip slugs already enriched OK unless --force. (Curated runs
  // historically rewrite the whole file; preserve that unless resuming DFP.)
  const skipped = new Set<string>();
  if (!force && dfp) {
    targets = targets.filter((t) => {
      if (existing[t.slug]) {
        skipped.add(t.slug);
        return false;
      }
      return true;
    });
  }
  if (Number.isFinite(limit)) targets = targets.slice(0, limit);

  const mode = dfp ? "DFP long-tail" : all ? "curated + DFP $$" : "curated only";
  console.log(
    `Enriching ${targets.length} places (${mode})` +
      (skipped.size ? ` · resuming, ${skipped.size} already cached` : "") +
      "…",
  );

  // Start from cache when resuming DFP so a partial write keeps prior rows.
  const result: Record<string, EnrichedRow> = dfp && !force ? { ...existing } : {};
  let ok = 0,
    closed = 0,
    miss = 0;
  const t0 = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    let data: PlaceEnrichment | null = null;
    try {
      data = await enrichOne(t);
    } catch (err) {
      console.error(`  ! ${t.slug}: ${(err as Error).message}`);
    }
    if (!data) {
      miss++;
    } else {
      result[t.slug] = { ...data, enriched_at: new Date().toISOString() };
      ok++;
      if (data.business_status === "CLOSED_PERMANENTLY") closed++;
    }
    const n = i + 1;
    if (n % 25 === 0 || n === targets.length) {
      console.log(`  ${n}/${targets.length} · ok:${ok} closed:${closed} miss:${miss}`);
      // Checkpoint to disk so an interrupted DFP run loses nothing.
      if (dfp) writeFileSync(out, JSON.stringify(result, null, 0));
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  writeFileSync(out, JSON.stringify(result, null, 0));
  console.log(`\nWrote ${out}`);
  console.log(`Enriched ${ok} · permanently-closed ${closed} · no-match ${miss}`);
  console.log(`Took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const closedSlugs = Object.entries(result)
    .filter(([, v]) => v.business_status === "CLOSED_PERMANENTLY")
    .map(([k]) => k);
  if (closedSlugs.length) {
    console.log(
      `\n⚠ Permanently closed (review for removal):\n  ${closedSlugs.join("\n  ")}`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
