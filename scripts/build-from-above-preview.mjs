#!/usr/bin/env node
// Build assets for /from-above/preview from the rendered print PDF pages.
//
// Workflow:
//   1) pre-step (shell): pdftocairo -png -r 200 to /tmp/dtf-extract/pages
//   2) this script: trim white margins, classify by aspect, pick the strongest
//      photos, emit WebP @ 800/1200/1600 + a manifest.json
//
// The print book has heavy white margins (typical for a $$ coffee-table
// design) but on a phone screen we want full-bleed photography. Trimming
// the white gives us the actual image region; from there we filter by
// minimum size and aspect to drop text pages and tiny placement images.
//
// Run: node scripts/build-from-above-preview.mjs
import sharp from "sharp";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PAGES = "/tmp/dtf-extract/pages";
const COVER_SRC = "/tmp/dtf-extract/cover/front.jpg";
const OUT = "public/from-above";
const SIZES = [800, 1200, 1600];
const MIN_LONG_EDGE = 1400; // skip tiny page elements / quote pages
const MIN_RATIO = 0.55;     // skip very narrow trims (page numbers, captions)
// Portrait-only: book preview is vertical-by-design. The print PDF has
// the occasional landscape spread, but on a phone-first swipe deck
// landscape photos either get cropped to feel landscape (object-fit:
// cover) or letterbox with huge black bars (object-fit: contain) —
// neither reads. Enforce portrait at the source so the manifest can
// never sneak a landscape in on a re-run.
const MAX_RATIO = 0.95;
// Pages we know are front matter (title, dedication, narrative, ToC,
// section openers with quotes) and shouldn't make the digital cut.
// Pages 1-12 are this book's front matter; the photography starts ~p-013.
// Easier to maintain by source page than to teach the trimmer to
// recognize captions/quotes/section openers.
const SKIP_SOURCE_PAGES = new Set(
  Array.from({ length: 12 }, (_, i) => `p-${String(i + 1).padStart(3, "0")}.png`),
);

async function trimmedMeta(path) {
  // Trim white margins. threshold is on a 0-100 scale here in modern sharp;
  // 12 leaves a tiny halo we then re-trim away with extract padding=0.
  const img = sharp(path).trim({ threshold: 12 });
  const buf = await img.toBuffer({ resolveWithObject: true });
  return { buf: buf.data, w: buf.info.width, h: buf.info.height };
}

// Detect text-heavy pages by mean luminance. Photo pages average mid-50s
// (lots of color across the histogram). Pure text pages average ≥220
// (mostly white with thin dark glyphs). Empirically anything ≥190 reads
// as "mostly white" and shouldn't be included.
async function meanLuminance(buf) {
  const { data, info } = await sharp(buf)
    .resize(64, 64, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  const px = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / px;
}

async function main() {
  await mkdir(join(OUT, "photos"), { recursive: true });

  console.log("processing cover…");
  await sharp(COVER_SRC)
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 88 })
    .toFile(join(OUT, "cover-front.webp"));

  const files = (await readdir(PAGES)).filter((f) => f.endsWith(".png")).sort();
  console.log(`scanning ${files.length} rendered pages…`);

  const candidates = [];
  for (const f of files) {
    if (SKIP_SOURCE_PAGES.has(f)) continue;
    try {
      const t = await trimmedMeta(join(PAGES, f));
      const long = Math.max(t.w, t.h);
      const ratio = t.w / t.h;
      if (long < MIN_LONG_EDGE) continue;
      if (ratio < MIN_RATIO || ratio > MAX_RATIO) continue;
      const lum = await meanLuminance(t.buf);
      if (lum > 190) continue; // mostly-white = text page
      candidates.push({ f, ...t, long, ratio, lum });
    } catch (e) {
      // trim can fail on pure-white pages; skip them
    }
  }
  console.log(`  → ${candidates.length} candidates after trim/filter`);

  // De-dupe near-duplicates: when consecutive pages produce trims of
  // identical dimensions, the print layout was probably echoing the
  // same photo across a spread. Keep the first.
  const deduped = [];
  let lastKey = "";
  for (const c of candidates) {
    const key = `${Math.round(c.w / 20)}x${Math.round(c.h / 20)}`;
    if (key === lastKey) continue;
    deduped.push(c);
    lastKey = key;
  }
  console.log(`  → ${deduped.length} after de-dupe`);

  // Take up to 14 for the preview
  const chosen = deduped.slice(0, 14);

  const manifest = [];
  for (let i = 0; i < chosen.length; i++) {
    const c = chosen[i];
    const id = String(i + 1).padStart(2, "0");
    const variants = {};
    for (const w of SIZES) {
      const targetW = Math.min(w, c.w);
      const fname = `${id}@${w}.webp`;
      await sharp(c.buf)
        .resize({ width: targetW, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(join(OUT, "photos", fname));
      variants[w] = `/from-above/photos/${fname}`;
    }
    const meta = await sharp(join(OUT, "photos", `${id}@1600.webp`)).metadata();
    manifest.push({
      id,
      src: variants[1600],
      srcSet: SIZES.map((w) => `${variants[w]} ${w}w`).join(", "),
      width: meta.width,
      height: meta.height,
      orient: (meta.width || 0) >= (meta.height || 0) ? "landscape" : "portrait",
    });
    console.log(`  → ${id}  ${meta.width}×${meta.height}  (from ${c.f})`);
  }

  await writeFile(
    join(OUT, "manifest.json"),
    JSON.stringify({ cover: "/from-above/cover-front.webp", photos: manifest }, null, 2),
  );
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
