/**
 * Enrich curated places with Google Places data → src/data/places-enrichment.json
 *
 * Cost control: by default enriches ONLY the curated editorial places
 * (source !== "dfp"), ~51 places, ~$2 one-time. DFP's 1,280 long-tail are
 * enriched on-demand elsewhere (when a user opens the sheet).
 *
 *   npm run enrich                 # curated only
 *   npm run enrich -- --limit 5    # smoke test
 *   npm run enrich -- --all        # everything ($$)
 *
 * Resolution: google_place_id when present (cheap), else Text Search by
 * "name, address" biased to the place's coordinates.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PLACES } from "@/data/places";
import {
  getPlaceDetails,
  resolveAndEnrich,
  type PlaceEnrichment,
} from "@/lib/integrations/google-places";

const OUT = new URL("../src/data/places-enrichment.json", import.meta.url).pathname;

async function main() {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY not set. Run: vercel env pull .env.local");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const dfpThin = args.includes("--dfp-thin");
  const live = args.includes("--live") && args.includes("--confirm");
  const mi = args.indexOf("--max-cost");
  const maxCost = mi >= 0 ? parseFloat(args[mi + 1]) : 60;
  const li = args.indexOf("--limit");
  const limit = li >= 0 ? parseInt(args[li + 1], 10) : Infinity;

  // MERGE, never overwrite: seed from the existing enrichment so a
  // scoped run can never destroy discovered/other rows (the original
  // bug: writeFileSync of a fresh {} wiped everything not re-run).
  const existing: Record<string, PlaceEnrichment & { enriched_at: string }> =
    JSON.parse(readFileSync(OUT, "utf8"));

  let targets = PLACES.filter((p) => {
    if (all) return true;
    if (dfpThin) {
      if (p.source !== "dfp") return false;
      const e = existing[p.slug];
      return !e?.editorial_summary?.trim() && !e?.review_snippet?.trim();
    }
    return p.source !== "dfp"; // default: curated only (original behaviour)
  });
  if (Number.isFinite(limit)) targets = targets.slice(0, limit);

  // Cost projection. place_id present -> Place Details ($25/1k);
  // otherwise resolveAndEnrich = Text Search ($32/1k) + Details.
  const withId = targets.filter(
    (p) => p.google_place_id && /^ChIJ/.test(p.google_place_id),
  ).length;
  const noId = targets.length - withId;
  const listCost = (withId * 25 + noId * (32 + 25)) / 1000;
  const scope = all ? "ALL incl. DFP" : dfpThin ? "DFP thin" : "curated only";
  console.log(`\n  Enrich — ${scope}`);
  console.log(`  ----------------------------------------`);
  console.log(`  targets               ${targets.length}  (place_id ${withId} · text-search ${noId})`);
  console.log(`  list cost             $${listCost.toFixed(2)}`);
  console.log(`  after 5,000/mo free   ~$0.00`);
  console.log(`  hard cap (--max-cost) $${maxCost.toFixed(2)}`);
  if (listCost > maxCost) {
    console.log(`  ABORT: projected list cost exceeds the cap.\n`);
    process.exit(1);
  }
  if (!live) {
    console.log(`  DRY RUN — nothing called, $0 spent.`);
    console.log(
      `  To execute: npm run enrich -- ${dfpThin ? "--dfp-thin " : all ? "--all " : ""}--live --confirm\n`,
    );
    process.exit(0);
  }
  console.log(`  LIVE — enriching…\n`);

  // Merge base: keep every existing row; the loop overlays only the
  // freshly-enriched targets.
  const out: Record<string, PlaceEnrichment & { enriched_at: string }> = { ...existing };
  const touched: string[] = [];
  let ok = 0, closed = 0, miss = 0;
  const t0 = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    let data: PlaceEnrichment | null = null;
    if (p.google_place_id && /^ChIJ/.test(p.google_place_id)) {
      data = await getPlaceDetails(p.google_place_id, "full");
    } else {
      data = await resolveAndEnrich({
        name: p.name,
        address: `${p.address}, ${p.city}, MD`,
        lat: p.geom?.lat,
        lng: p.geom?.lng,
      }, "full");
    }
    if (!data) {
      miss++;
    } else {
      out[p.slug] = { ...data, enriched_at: new Date().toISOString() };
      touched.push(p.slug);
      ok++;
      if (data.business_status === "CLOSED_PERMANENTLY") closed++;
    }
    if ((i + 1) % 10 === 0 || i === targets.length - 1) {
      console.log(`  ${i + 1}/${targets.length} · ok:${ok} closed:${closed} miss:${miss}`);
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  writeFileSync(OUT, JSON.stringify(out, null, 0));
  console.log(`\nWrote ${OUT}`);
  console.log(`Enriched ${ok} · permanently-closed ${closed} · no-match ${miss}`);
  console.log(`Took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const closedSlugs = touched.filter(
    (s) => out[s]?.business_status === "CLOSED_PERMANENTLY",
  );
  if (closedSlugs.length) {
    console.log(`\n⚠ Permanently closed (review for removal):\n  ${closedSlugs.join("\n  ")}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
