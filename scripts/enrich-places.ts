/**
 * Enrich curated places with Google Places data → src/data/places-enrichment.json
 *
 * Cost control: by default enriches ONLY the manual and seed editorial
 * records. Discovered and DFP inventory are handled by their own reviewed
 * paths rather than being swept implicitly.
 *
 *   npm run enrich                                   # plan first 100 curated
 *   npm run enrich -- --limit 5                      # plan a smoke batch
 *   npm run enrich -- --live --confirm --limit 100   # execute reviewed batch
 *   npm run enrich -- --all --limit 100              # plan across all sources
 *
 * Resolution: google_place_id when present (cheap), else Text Search by
 * "name, address" biased to the place's coordinates.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { PLACES } from "@/data/places";
import { isValidCoord } from "@/lib/geo";
import {
  getPlaceDetailsResult,
  resolveAndEnrichResult,
  type PlaceEnrichment,
} from "@/lib/integrations/google-places";
import {
  assertManualGoogleArgs,
  createManualGoogleCallBudget,
  googleCostPreview,
  parseManualGoogleRun,
  selectRotatingManualBatch,
} from "./lib/manual-google-run";

const OUT = new URL("../src/data/places-enrichment.json", import.meta.url).pathname;
const ATTEMPTS = new URL("../audit/google-enrichment-attempts.json", import.meta.url).pathname;
const MISS_BACKOFF_MS = 30 * 86_400_000;

type EnrichmentAttempt = {
  attempted_at: string;
  result: "enriched" | "no_match";
};

function writeJsonAtomic(path: string, value: unknown): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, path === ATTEMPTS ? 2 : 0));
  renameSync(temporary, path);
}

async function main() {
  const args = process.argv.slice(2);
  assertManualGoogleArgs(args, {
    booleanFlags: ["--all", "--dfp-thin", "--needs-enrichment"],
    valueFlags: ["--slug"],
  });
  const run = parseManualGoogleRun(args, {
    defaultLimit: 100,
    maxLimit: 500,
  });
  const all = args.includes("--all");
  const dfpThin = args.includes("--dfp-thin");
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
  const namedScopes = [all, dfpThin, needsEnrichment].filter(Boolean).length;
  if (namedScopes > 1 || (slugs && namedScopes > 0)) {
    throw new Error(
      "Choose exactly one enrichment scope: --slug, --needs-enrichment, --dfp-thin, --all, or the curated default.",
    );
  }
  if (slugs && slugs.size === 0) {
    console.error("--slug was given with no slugs.");
    process.exit(1);
  }

  // MERGE, never overwrite: seed from the existing enrichment so a
  // scoped run can never destroy discovered/other rows (the original
  // bug: writeFileSync of a fresh {} wiped everything not re-run).
  const existing: Record<string, PlaceEnrichment & { enriched_at: string }> =
    JSON.parse(readFileSync(OUT, "utf8"));
  const attempts: Record<string, EnrichmentAttempt> = existsSync(ATTEMPTS)
    ? JSON.parse(readFileSync(ATTEMPTS, "utf8"))
    : {};

  const rejectedPlacement = PLACES.filter((p) => !isValidCoord(p.geom));
  let targets = PLACES.filter((p) => {
    // County membership is a prerequisite for any paid detail call.
    if (!isValidCoord(p.geom)) return false;
    // An explicit slug list is the whole selection: it deliberately ignores
    // the source-based filters below so a curated, DFP, or discovered record
    // can each be reached by name.
    if (slugs) return slugs.has(p.slug);
    if (needsEnrichment) {
      // The scheduled backlog is curated inventory only. DFP's long tail is
      // deliberately handled on demand or through an explicit slug request.
      if (p.source !== "manual" && p.source !== "seed") return false;
      const e = existing[p.slug];
      if (e?.google_place_id) return false;
      const attempt = attempts[p.slug];
      const attemptedAt = Date.parse(attempt?.attempted_at ?? "");
      const inBackoff =
        attempt?.result === "no_match" &&
        Number.isFinite(attemptedAt) &&
        Date.now() - attemptedAt < MISS_BACKOFF_MS;
      return !inBackoff;
    }
    if (all) return true;
    if (dfpThin) {
      if (p.source !== "dfp") return false;
      const e = existing[p.slug];
      return !e?.editorial_summary?.trim() && !e?.review_snippet?.trim();
    }
    return p.source === "manual" || p.source === "seed";
  });
  const eligibleCount = targets.length;
  const eligibleSlugs = new Set(targets.map((place) => place.slug));
  const now = new Date();
  const cycle = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const selection = needsEnrichment
    ? selectRotatingManualBatch(targets, run.limit, cycle)
    : { items: targets.slice(0, run.limit), offset: 0 };
  targets = selection.items;

  // A mistyped or already-removed slug would otherwise shrink a paid run in
  // silence and read as "done". Name what could not be matched.
  if (slugs) {
    const missing = [...slugs].filter((slug) => !eligibleSlugs.has(slug));
    if (missing.length > 0) {
      console.log(
        `\n  WARNING: ${missing.length} requested slug(s) matched no in-county place: ${missing.join(", ")}`,
      );
    }
  }

  // Cost projection for the explicit "full" mask. A known ID uses Place
  // Details Enterprise + Atmosphere ($25/1k); resolution without an ID is one
  // Text Search Enterprise + Atmosphere call ($40/1k), not Search + Details.
  const withId = targets.filter(
    (p) => p.google_place_id && /^ChIJ/.test(p.google_place_id),
  ).length;
  const noId = targets.length - withId;
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
  console.log(`  eligible              ${eligibleCount}`);
  console.log(`  targets               ${targets.length}  (place_id ${withId} · text-search ${noId})`);
  if (needsEnrichment) {
    console.log(`  monthly rotation      offset ${selection.offset}`);
  }
  console.log(`  hard request ceiling  ${run.limit}`);
  console.log(
    `  ${googleCostPreview({
      calls: withId,
      pricePerThousandUsd: 25,
      sku: "Place Details Enterprise + Atmosphere",
    })}`,
  );
  console.log(
    `  ${googleCostPreview({
      calls: noId,
      pricePerThousandUsd: 40,
      sku: "Text Search Enterprise + Atmosphere",
    })}`,
  );
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
  if (run.dryRun) {
    console.log(`  DRY RUN — nothing called, $0 spent.`);
    console.log(
      `  To execute: npm run enrich -- ${dfpThin ? "--dfp-thin " : all ? "--all " : ""}--live --confirm --limit N\n`,
    );
    process.exit(0);
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY not set. Run: vercel env pull .env.local");
    process.exit(1);
  }
  console.log(`  LIVE — enriching…\n`);

  // Merge base: keep every existing row; the loop overlays only the
  // freshly-enriched targets.
  const out: Record<string, PlaceEnrichment & { enriched_at: string }> = { ...existing };
  const touched: string[] = [];
  let ok = 0, closed = 0, miss = 0;
  const t0 = Date.now();
  const callBudget = createManualGoogleCallBudget(run.limit);

  for (let i = 0; i < targets.length; i++) {
    if (!callBudget.reserve()) break;
    const p = targets[i];
    const lookup = p.google_place_id && /^ChIJ/.test(p.google_place_id)
      ? await getPlaceDetailsResult(p.google_place_id, "full")
      : await resolveAndEnrichResult({
        name: p.name,
        address: `${p.address}, ${p.city}, MD`,
        lat: p.geom?.lat,
        lng: p.geom?.lng,
      }, "full");
    if (lookup.status === "provider_error") {
      throw new Error(
        `Google Places failed for ${p.slug} (${lookup.reason}); stopping without recording a no-match backoff.`,
      );
    }
    const data: PlaceEnrichment | null = lookup.status === "found" ? lookup.data : null;
    if (!data) {
      miss++;
      attempts[p.slug] = {
        attempted_at: new Date().toISOString(),
        result: "no_match",
      };
    } else {
      out[p.slug] = { ...data, enriched_at: new Date().toISOString() };
      attempts[p.slug] = {
        attempted_at: new Date().toISOString(),
        result: "enriched",
      };
      touched.push(p.slug);
      ok++;
      if (data.business_status === "CLOSED_PERMANENTLY") closed++;
    }
    // Save each paid result before the next provider call. A crash can lose at
    // most the in-flight request, not the whole reviewed batch.
    writeJsonAtomic(OUT, out);
    writeJsonAtomic(ATTEMPTS, attempts);
    if ((i + 1) % 10 === 0 || i === targets.length - 1) {
      console.log(`  ${i + 1}/${targets.length} · ok:${ok} closed:${closed} miss:${miss}`);
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  writeJsonAtomic(OUT, out);
  writeJsonAtomic(ATTEMPTS, attempts);
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
