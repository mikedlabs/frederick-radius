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
import { isValidCoord } from "@/lib/geo";
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
  // --slug a,b,c — enrich exactly these records and nothing else.
  //
  // Without this the smallest possible run was "every curated place", which
  // projects past any sane cap and aborts, so the 27 records that have never
  // been Google-enriched could not be reached at all: the only way to cover
  // them was to re-pay for ~1,000 already-healthy rows. --limit does not help
  // because it slices the head of the catalog, not the places that need work.
  // --needs-enrichment — the places that have never been resolved against
  // Google at all. This is the scope a SCHEDULED run wants: it is exactly the
  // hole new curated records fall into, it costs nothing once drained, and it
  // shrinks to zero on its own. "Every curated place" could never be scheduled
  // because it re-pays for ~1,000 healthy rows and aborts against any cap.
  const needsEnrichment = args.includes("--needs-enrichment");
  const si = args.indexOf("--slug");
  const slugs = si >= 0
    ? new Set(
        (args[si + 1] ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      )
    : null;
  if (slugs && slugs.size === 0) {
    console.error("--slug was given with no slugs.");
    process.exit(1);
  }

  // MERGE, never overwrite: seed from the existing enrichment so a
  // scoped run can never destroy discovered/other rows (the original
  // bug: writeFileSync of a fresh {} wiped everything not re-run).
  const existing: Record<string, PlaceEnrichment & { enriched_at: string }> =
    JSON.parse(readFileSync(OUT, "utf8"));

  const rejectedPlacement = PLACES.filter((p) => !isValidCoord(p.geom));
  let targets = PLACES.filter((p) => {
    // County membership is a prerequisite for any paid detail call.
    if (!isValidCoord(p.geom)) return false;
    // An explicit slug list is the whole selection: it deliberately ignores
    // the source-based filters below so a curated, DFP, or discovered record
    // can each be reached by name.
    if (slugs) return slugs.has(p.slug);
    if (needsEnrichment) {
      const e = existing[p.slug];
      return !e || !e.google_place_id;
    }
    if (all) return true;
    if (dfpThin) {
      if (p.source !== "dfp") return false;
      const e = existing[p.slug];
      return !e?.editorial_summary?.trim() && !e?.review_snippet?.trim();
    }
    return p.source !== "dfp"; // default: curated only (original behaviour)
  });
  if (Number.isFinite(limit)) targets = targets.slice(0, limit);

  // A mistyped or already-removed slug would otherwise shrink a paid run in
  // silence and read as "done". Name what could not be matched.
  if (slugs) {
    const matched = new Set(targets.map((p) => p.slug));
    const missing = [...slugs].filter((slug) => !matched.has(slug));
    if (missing.length > 0) {
      console.log(
        `\n  WARNING: ${missing.length} requested slug(s) matched no in-county place: ${missing.join(", ")}`,
      );
    }
  }

  // Cost projection. place_id present -> Place Details ($25/1k);
  // otherwise resolveAndEnrich = Text Search ($32/1k) + Details.
  const withId = targets.filter(
    (p) => p.google_place_id && /^ChIJ/.test(p.google_place_id),
  ).length;
  const noId = targets.length - withId;
  const listCost = (withId * 25 + noId * (32 + 25)) / 1000;
  const scope = slugs
    ? `${slugs.size} named slug(s)`
    : needsEnrichment
      ? "never-enriched only"
      : all
      ? "ALL incl. DFP"
      : dfpThin
        ? "DFP thin"
        : "curated only";
  console.log(`\n  Enrich — ${scope}`);
  console.log(`  ----------------------------------------`);
  console.log(`  targets               ${targets.length}  (place_id ${withId} · text-search ${noId})`);
  console.log(`  list cost             $${listCost.toFixed(2)}`);
  console.log(`  after 5,000/mo free   ~$0.00`);
  console.log(`  hard cap (--max-cost) $${maxCost.toFixed(2)}`);
  if (rejectedPlacement.length > 0) {
    console.log(
      `  placement rejects     ${rejectedPlacement.length} (retained in source data; no paid call)`,
    );
  }
  // A drained backlog is success, not a no-op to be puzzled over. Say so and
  // leave cleanly so a scheduled run stays green.
  if (targets.length === 0) {
    console.log(`  nothing to enrich — every targeted place already has a Google identity.\n`);
    process.exit(0);
  }
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
