/**
 * Image optimization — generate WebP variants alongside JPEG originals.
 *
 *   npm run optimize:images          → scan public/ and emit .webp next to .jpg
 *   npm run optimize:images -- --force  → re-encode even if .webp exists
 *
 * Why WebP next to the JPEG and not Next/Image:
 *   - HistoryDeck.tsx renders the photos through a plain <img> (we have
 *     an ESLint pragma noting the deliberate choice — avoids a domain
 *     allowlist for public-domain photos). A <picture> with a WebP
 *     <source> + JPEG fallback ships the win without changing the
 *     rendering path.
 *   - JPEGs stay in the tree as the fallback, so older clients still
 *     work. Modern browsers (Safari 14+, all Chromiums) pick the WebP.
 *
 * Encoding choices:
 *   - quality 78 — perceptually indistinguishable from the source JPEGs
 *     for editorial photos, but ~50–70% smaller on this set
 *   - effort 6 — slower encode, better compression. Build-time cost is
 *     trivial; bytes ship to every visitor
 *   - smartSubsample on — better color near edges, important for the
 *     archival photos that have a lot of high-contrast text/lines
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import sharp from "sharp";

type Result = {
  src: string;
  out: string;
  beforeBytes: number;
  afterBytes: number;
  skipped: boolean;
};

const FORCE = process.argv.includes("--force");
const SOURCE_DIRS = ["public/history-photos"];

async function optimizeOne(src: string, force: boolean): Promise<Result> {
  const out = src.replace(/\.(jpe?g|png)$/i, ".webp");
  const before = statSync(src).size;

  if (!force && existsSync(out)) {
    const outStat = statSync(out);
    const srcStat = statSync(src);
    if (outStat.mtimeMs >= srcStat.mtimeMs) {
      return { src, out, beforeBytes: before, afterBytes: outStat.size, skipped: true };
    }
  }

  await sharp(src)
    .webp({ quality: 78, effort: 6, smartSubsample: true })
    .toFile(out);

  const after = statSync(out).size;
  return { src, out, beforeBytes: before, afterBytes: after, skipped: false };
}

function listImages(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .map((f) => join(dir, f));
}

function fmt(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function bar(pct: number, width = 24): string {
  const filled = Math.round((pct / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)} ${pct.toFixed(0)}%`;
}

async function main() {
  const all = SOURCE_DIRS.flatMap(listImages);
  if (all.length === 0) {
    console.log("No images found under:", SOURCE_DIRS.join(", "));
    return;
  }
  console.log(`Optimizing ${all.length} images${FORCE ? " (force re-encode)" : ""}`);
  console.log();

  const results: Result[] = [];
  for (const src of all) {
    const r = await optimizeOne(src, FORCE);
    results.push(r);
    const savedPct = ((1 - r.afterBytes / r.beforeBytes) * 100);
    const tag = r.skipped ? "skip" : "ok";
    const name = r.src.split("/").pop() ?? r.src;
    const padded = name.padEnd(36, " ");
    console.log(
      `  ${tag.padEnd(4)} ${padded} ${fmt(r.beforeBytes).padStart(9)} → ${fmt(r.afterBytes).padStart(9)}  ${bar(Math.max(0, savedPct))}`
    );
  }

  const totalBefore = results.reduce((a, r) => a + r.beforeBytes, 0);
  const totalAfter = results.reduce((a, r) => a + r.afterBytes, 0);
  const totalSaved = totalBefore - totalAfter;
  const savedPct = (totalSaved / totalBefore) * 100;

  console.log();
  console.log(
    `Total: ${fmt(totalBefore)} → ${fmt(totalAfter)} (saved ${fmt(totalSaved)}, ${savedPct.toFixed(0)}%)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// avoid an unused-import warning for the type-only side of node:path
void extname;
