/**
 * download-photos — pull Google Places photo bytes once, upload to
 * Vercel Blob, and write a slug → public-URL map to
 * src/data/places-photos.json.
 *
 * The problem
 *   Google Places returns photo REFERENCES (e.g. "places/ChIJ.../
 *   photos/AfL..."). The references rotate every few weeks. That
 *   is why the live photo proxy starts returning 400s without any
 *   code change on our side — the user-visible result is "all the
 *   photos disappeared." Permanent fix: download bytes once, host
 *   them ourselves.
 *
 * Usage
 *   1. Set env vars (or `vercel env pull .env.local`):
 *        - GOOGLE_PLACES_API_KEY   (existing; same key the enricher uses)
 *        - BLOB_READ_WRITE_TOKEN   (Vercel project → Storage → Blob)
 *   2. Dry run:
 *        npm run download:photos
 *   3. Execute:
 *        npm run download:photos -- --live --confirm
 *
 *   The script is resumable. It skips any slug already present in
 *   places-photos.json. A failed Google fetch logs and continues —
 *   no single bad reference aborts the whole run.
 *
 * Cost
 *   Vercel Blob: free tier is 1 GB storage + 1 GB egress. At ~50 KB
 *   per JPEG, 1,300 places ≈ 65 MB — fits with room to spare.
 *   Google Places: photo media calls are FREE under the Place
 *   Details quota; you've already paid for the reference.
 *
 * Implementation
 *   - Uses Vercel Blob's HTTP API directly (no @vercel/blob dep)
 *   - Concurrency 4 — keeps the run snappy without flooding Google
 *   - Writes places-photos.json incrementally so Ctrl-C is safe
 */
import { readFileSync, writeFileSync } from "node:fs";

// We import the enrichment JSON via require to avoid Node's
// import-assertions stability surface.
const ENRICHMENT_PATH = new URL(
  "../src/data/places-enrichment.json",
  import.meta.url,
).pathname;
const PHOTOS_PATH = new URL(
  "../src/data/places-photos.json",
  import.meta.url,
).pathname;

type Enrichment = {
  photo_names?: string[];
};

type EnrichmentMap = Record<string, Enrichment>;

const args = process.argv.slice(2);
const live = args.includes("--live") && args.includes("--confirm");
const li = args.indexOf("--limit");
const limit = li >= 0 ? parseInt(args[li + 1], 10) : Infinity;

const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

function fatal(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!GOOGLE_KEY) fatal("GOOGLE_PLACES_API_KEY not set. Run: vercel env pull .env.local");
if (!BLOB_TOKEN) fatal("BLOB_READ_WRITE_TOKEN not set. Run: vercel env pull .env.local");

const enrichment: EnrichmentMap = JSON.parse(readFileSync(ENRICHMENT_PATH, "utf8"));
const existing: Record<string, string> = JSON.parse(readFileSync(PHOTOS_PATH, "utf8"));

// Resume-aware target set: every enriched slug with a photo, minus
// anything already in places-photos.json. Sorted alphabetically so
// resumed runs are deterministic.
const targets = Object.entries(enrichment)
  .filter(([slug, e]) => !existing[slug] && e.photo_names && e.photo_names.length > 0)
  .sort(([a], [b]) => a.localeCompare(b))
  .slice(0, Number.isFinite(limit) ? limit : undefined);

console.log("");
console.log("  Download photos → Vercel Blob");
console.log("  ----------------------------------------");
console.log(`  already downloaded    ${Object.keys(existing).length}`);
console.log(`  pending               ${targets.length}`);
console.log(`  mode                  ${live ? "LIVE" : "DRY RUN"}`);
if (!live) {
  console.log("");
  console.log("  DRY RUN — nothing fetched, nothing uploaded.");
  console.log("  To execute: npm run download:photos -- --live --confirm");
  console.log("");
  process.exit(0);
}
if (targets.length === 0) {
  console.log("  Nothing to do — every enriched place already has a Blob photo.");
  console.log("");
  process.exit(0);
}

/**
 * Fetch the Google photo bytes for a photo reference.
 * Google redirects to a Googleusercontent URL; the runtime handles
 * the redirect automatically.
 */
async function fetchGooglePhoto(photoName: string): Promise<ArrayBuffer> {
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&key=${GOOGLE_KEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Google photo HTTP ${r.status}: ${await r.text().catch(() => "")}`);
  return await r.arrayBuffer();
}

/**
 * Upload bytes to Vercel Blob at a stable pathname. Returns the
 * public URL. Uses the Blob REST API directly so we don't need to
 * pull in @vercel/blob as a dependency for a one-shot script.
 */
async function uploadToBlob(pathname: string, bytes: ArrayBuffer): Promise<string> {
  const r = await fetch(
    `https://blob.vercel-storage.com/${encodeURIComponent(pathname)}`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${BLOB_TOKEN}`,
        "x-content-type": "image/jpeg",
        "x-access": "public",
        "x-api-version": "7",
        "x-add-random-suffix": "1",
      },
      body: bytes,
    },
  );
  if (!r.ok) throw new Error(`Blob upload HTTP ${r.status}: ${await r.text().catch(() => "")}`);
  const json = (await r.json()) as { url?: string };
  if (!json.url) throw new Error("Blob upload returned no URL");
  return json.url;
}

/**
 * Process one slug: fetch the first photo from Google, upload to
 * Vercel Blob, write the resulting URL into the map.
 */
async function processSlug(slug: string, e: Enrichment): Promise<void> {
  const photoName = e.photo_names?.[0];
  if (!photoName) return;
  const bytes = await fetchGooglePhoto(photoName);
  const url = await uploadToBlob(`places/${slug}/hero.jpg`, bytes);
  existing[slug] = url;
  // Write after every success so Ctrl-C never loses work.
  writeFileSync(PHOTOS_PATH, JSON.stringify(existing, null, 2) + "\n");
}

/** Bounded-concurrency runner — 4 in flight. */
async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T, idx: number) => Promise<void>,
  concurrency = 4,
): Promise<void> {
  let i = 0;
  let done = 0;
  let failed = 0;
  const start = Date.now();
  async function next(): Promise<void> {
    while (i < items.length) {
      const myIdx = i++;
      try {
        await worker(items[myIdx], myIdx);
        done++;
      } catch (err) {
        failed++;
        console.error(`  ✗ #${myIdx} — ${(err as Error).message}`);
      }
      if ((done + failed) % 10 === 0 || done + failed === items.length) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        console.log(`  progress: ${done + failed}/${items.length} (${done} ok, ${failed} fail, ${elapsed}s)`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => next()));
}

await runWithConcurrency(
  targets,
  async ([slug, e]) => processSlug(slug, e),
  4,
);

console.log("");
console.log(`  Done. ${Object.keys(existing).length} slugs in places-photos.json.`);
console.log("  Commit src/data/places-photos.json and deploy.");
console.log("");
