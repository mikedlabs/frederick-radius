/**
 * optimize-seasonal-photos.ts
 *
 * One-time-ish image pipeline for the SeasonalPhoto component.
 *
 * Reads from the user's Dropbox source folder:
 *   ~/Library/CloudStorage/Dropbox/Seasons/Photos/{SPRING,SUMMER,FALL,WINTER}/NNN SEASON.jpg
 *
 * Writes web-friendly versions to:
 *   public/images/seasons/{spring,summer,fall,winter}/NNN.jpg  (1920w, quality 78, stripped EXIF)
 *   public/images/seasons/manifest.json  (per-image dimensions + dominant color for blur)
 *
 * The 5464×3070 raws are too big to ship as-is. We commit a single
 * 1920-wide JPG per photo and let Vercel's next/image optimization
 * serve smaller variants on demand at request time. The manifest
 * gives us a stable, server-side index of what's available (plus a
 * dominant-color hex per image for blur placeholders before the
 * real photo lands).
 *
 * Run via: npm run optimize:seasons
 *
 * Re-running is idempotent — existing optimized files are skipped
 * unless --force is passed.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";

const SOURCE_ROOT =
  process.env.SEASONS_SOURCE ||
  path.join(os.homedir(), "Library/CloudStorage/Dropbox/Seasons/Photos");

const OUT_ROOT = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "public",
  "images",
  "seasons",
);

const SEASONS = ["SPRING", "SUMMER", "FALL", "WINTER"] as const;
const TARGET_WIDTH = 1920;
const JPEG_QUALITY = 78;

type ManifestEntry = {
  slug: string;
  src: string;
  width: number;
  height: number;
  /** Hex color sampled at the image center — drives the blur placeholder. */
  blur: string;
};

type Manifest = {
  spring: ManifestEntry[];
  summer: ManifestEntry[];
  fall: ManifestEntry[];
  winter: ManifestEntry[];
  generatedAt: string;
};

const FORCE = process.argv.includes("--force");

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

async function dominantColor(buf: Buffer): Promise<string> {
  // Tiny 1px crop in the center, average color. Good enough for a blur
  // placeholder that mostly matches the photo's mood.
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 100;
  const h = meta.height ?? 100;
  const stats = await sharp(buf)
    .extract({
      left: Math.floor(w * 0.4),
      top: Math.floor(h * 0.4),
      width: Math.floor(w * 0.2),
      height: Math.floor(h * 0.2),
    })
    .resize(1, 1)
    .raw()
    .toBuffer();
  const r = stats[0];
  const g = stats[1];
  const b = stats[2];
  return `#${[r, g, b]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function processSeason(season: (typeof SEASONS)[number]): Promise<ManifestEntry[]> {
  const seasonLower = season.toLowerCase();
  const srcDir = path.join(SOURCE_ROOT, season);
  const outDir = path.join(OUT_ROOT, seasonLower);
  await ensureDir(outDir);

  let files: string[] = [];
  try {
    files = (await fs.readdir(srcDir))
      .filter((f) => /\.(jpe?g|JPE?G)$/.test(f))
      .sort();
  } catch (err) {
    console.warn(`[seasons] cannot read ${srcDir} —`, err instanceof Error ? err.message : err);
    return [];
  }

  const entries: ManifestEntry[] = [];
  for (const file of files) {
    // Slug: "001 SPRING.jpg" → "001". The number alone gives stable URLs
    // even if the seasonal label in the filename ever changes.
    const slug = file.match(/^(\d+)/)?.[1] ?? path.parse(file).name;
    const outName = `${slug}.jpg`;
    const outPath = path.join(outDir, outName);

    let buf: Buffer;
    try {
      buf = await fs.readFile(path.join(srcDir, file));
    } catch (err) {
      console.warn(`[seasons] skip ${file} —`, err instanceof Error ? err.message : err);
      continue;
    }

    // Skip if already exists + we're not forcing a regen. Re-runs are
    // cheap; this is the default for incremental adds.
    if (!FORCE) {
      try {
        await fs.access(outPath);
        const meta = await sharp(outPath).metadata();
        const blur = await dominantColor(buf);
        entries.push({
          slug,
          src: `/images/seasons/${seasonLower}/${outName}`,
          width: meta.width ?? TARGET_WIDTH,
          height: meta.height ?? Math.round((TARGET_WIDTH * 3070) / 5464),
          blur,
        });
        continue;
      } catch {
        // Doesn't exist — fall through to write.
      }
    }

    const optimized = await sharp(buf)
      .rotate() // honors EXIF orientation, then strips
      .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
      .jpeg({
        quality: JPEG_QUALITY,
        progressive: true,
        mozjpeg: true,
      })
      .withMetadata({}) // strip EXIF for privacy + size
      .toBuffer();
    await fs.writeFile(outPath, optimized);
    const meta = await sharp(optimized).metadata();
    const blur = await dominantColor(buf);
    entries.push({
      slug,
      src: `/images/seasons/${seasonLower}/${outName}`,
      width: meta.width ?? TARGET_WIDTH,
      height: meta.height ?? Math.round((TARGET_WIDTH * 3070) / 5464),
      blur,
    });
    console.log(
      `[seasons] ${season.padEnd(6)} ${slug}  →  ${meta.width}×${meta.height}  ${blur}  ` +
        `(${Math.round(optimized.length / 1024)} KB)`,
    );
  }
  return entries;
}

async function main(): Promise<void> {
  await ensureDir(OUT_ROOT);
  const result: Manifest = {
    spring: [],
    summer: [],
    fall: [],
    winter: [],
    generatedAt: new Date().toISOString(),
  };
  for (const season of SEASONS) {
    const entries = await processSeason(season);
    result[season.toLowerCase() as Lowercase<typeof season>] = entries;
  }
  const manifestPath = path.join(OUT_ROOT, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(result, null, 2) + "\n");
  console.log(
    `\n[seasons] manifest → ${manifestPath}\n` +
      `         spring: ${result.spring.length} · summer: ${result.summer.length} · ` +
      `fall: ${result.fall.length} · winter: ${result.winter.length}\n`,
  );
}

main().catch((err) => {
  console.error("[seasons] fatal —", err);
  process.exit(1);
});
