#!/usr/bin/env node
// Build assets for the /from-above book preview from the InDesign-
// rendered PRINT PDF + COVER PDF.
//
// Source files (NOT committed; kept in the owner's Dropbox so the
// master PDF stays out of the repo and never lands in /public):
//   ~/Dropbox/DTF Final Art Files/DTF_Book_v096-PRINT.pdf  (160 pages)
//   ~/Dropbox/DTF Final Art Files/DTF_Book_v096-COVER.pdf  (cover wrap)
//
// Pre-step (shell, before running this script):
//   pdftocairo -png -r 180 "PRINT.pdf" /tmp/dtf-extract/pages/p
//   pdftocairo -png -r 180 "COVER.pdf" /tmp/dtf-extract/cover/wrap
//
// This script then:
//   1. Trims white margins from each rendered page.
//   2. Drops pages that are too small, too narrow, or text-only.
//   3. Watermarks each survivor with a faint corner credit.
//   4. Emits sized WebP variants (cap at 1200px to discourage piracy
//      while keeping the preview crisp on mobile).
//   5. Names files with a random 4-char suffix so URLs are not
//      sequentially guessable (`pg-001.webp` is replaced with
//      `pg-001-a7f3.webp` etc).
//   6. Writes manifest.json with cover + photos.
//
// Run: node scripts/build-from-above-book.mjs
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { readdir, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const PAGES_DIR = "/tmp/dtf-extract/pages";
const COVER_DIR = "/tmp/dtf-extract/cover";
const OUT = "public/from-above";
// Preview sizes — capped at 1200px so a downloaded image is preview-
// grade, not print-grade. The original print files are 2000+px and
// stay in Dropbox; nothing on /public exposes them.
const SIZES = [800, 1200];
const MIN_LONG_EDGE = 1400;
const MIN_RATIO = 0.55;
const MAX_RATIO = 0.95;
// Pages 1-12 are the book's front matter (title, dedication, ToC,
// section openers). The photography proper starts ~page 13.
const SKIP_SOURCE_PAGES = new Set(
  Array.from({ length: 12 }, (_, i) => `p-${String(i + 1).padStart(3, "0")}.png`),
);
// Watermark applied to every interior page so a copied image carries
// the credit. Kept faint and corner-anchored so it doesn't fight the
// photography; large enough that re-cropping it out is annoying.
const WATERMARK_TEXT = "© Michael DeMattia · frederickradius.app";

async function trimmedMeta(path) {
  const img = sharp(path).trim({ threshold: 12 });
  const buf = await img.toBuffer({ resolveWithObject: true });
  return { buf: buf.data, w: buf.info.width, h: buf.info.height };
}

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

/**
 * Build an SVG watermark sized for the page, anchored bottom-right.
 * Returns a Buffer ready for sharp's .composite().
 */
function watermarkSvg(width, height) {
  const fontSize = Math.max(14, Math.round(width * 0.018));
  const padding = Math.round(fontSize * 0.7);
  // Faint white with a soft shadow so it reads on dark and light
  // backgrounds without screaming. Mix-blend-mode 'difference' isn't
  // available in raster composite; rely on opacity + slight stroke.
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <style>
    .wm {
      font-family: -apple-system, system-ui, sans-serif;
      font-size: ${fontSize}px;
      font-weight: 500;
      fill: rgba(255,255,255,0.62);
      paint-order: stroke;
      stroke: rgba(0,0,0,0.35);
      stroke-width: ${Math.max(1, fontSize * 0.06)}px;
    }
  </style>
  <text x="${width - padding}" y="${height - padding}" text-anchor="end" class="wm">${WATERMARK_TEXT}</text>
</svg>`;
  return Buffer.from(svg);
}

/** Random 4-char suffix for non-sequential filenames. */
function suffix() {
  return randomBytes(2).toString("hex");
}

async function processCover() {
  // The COVER PDF is a wrap (back · spine · front, often plus bleeds).
  // We need just the front-cover panel. Strategy: read the rendered
  // cover image, trim margins, then crop the right-most ~front-width.
  // Front and back are typically equal panels; with spine in the
  // middle the front is the rightmost ~45-48% of the trimmed width.
  const files = (await readdir(COVER_DIR)).filter((f) => f.endsWith(".png")).sort();
  if (files.length === 0) throw new Error("No cover render found");
  const src = join(COVER_DIR, files[0]);
  const trimmed = await sharp(src).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
  const w = trimmed.info.width;
  const h = trimmed.info.height;
  // Front-cover crop: rightmost panel. Assume back+spine occupy left
  // ~52%; the front fills the right 48%. Tweak via constants if a
  // future cover wrap changes proportions.
  const frontW = Math.round(w * 0.48);
  const frontLeft = w - frontW;
  const front = await sharp(trimmed.data)
    .extract({ left: frontLeft, top: 0, width: frontW, height: h })
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 88 })
    .toBuffer();
  const meta = await sharp(front).metadata();
  // Cover watermark — same line, smaller and even fainter so the
  // hardcover render reads cleanly.
  const coverWmSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">
  <text x="${meta.width - 18}" y="${meta.height - 18}" text-anchor="end"
        font-family="-apple-system, system-ui, sans-serif" font-size="${Math.max(11, Math.round(meta.width * 0.014))}px"
        fill="rgba(255,255,255,0.55)" stroke="rgba(0,0,0,0.32)" stroke-width="0.6" paint-order="stroke">${WATERMARK_TEXT}</text>
</svg>`;
  const out = await sharp(front)
    .composite([{ input: Buffer.from(coverWmSvg), gravity: "southeast" }])
    .webp({ quality: 88 })
    .toBuffer();
  await writeFile(join(OUT, "cover-front.webp"), out);
  console.log(`cover: ${meta.width}×${meta.height} → cover-front.webp`);
}

async function main() {
  // Wipe stale photos before regen so a smaller run doesn't leave
  // ghost files behind in /public.
  await rm(join(OUT, "photos"), { recursive: true, force: true });
  await mkdir(join(OUT, "photos"), { recursive: true });

  await processCover();

  const files = (await readdir(PAGES_DIR)).filter((f) => f.endsWith(".png")).sort();
  console.log(`scanning ${files.length} rendered pages…`);

  const candidates = [];
  for (const f of files) {
    if (SKIP_SOURCE_PAGES.has(f)) continue;
    try {
      const t = await trimmedMeta(join(PAGES_DIR, f));
      const long = Math.max(t.w, t.h);
      const ratio = t.w / t.h;
      if (long < MIN_LONG_EDGE) continue;
      if (ratio < MIN_RATIO || ratio > MAX_RATIO) continue;
      const lum = await meanLuminance(t.buf);
      if (lum > 190) continue; // text page
      candidates.push({ f, ...t, long, ratio, lum });
    } catch {
      /* trim failure on pure-white pages */
    }
  }
  console.log(`  → ${candidates.length} candidates after trim/filter`);

  // De-dupe near-duplicates by trimmed dimensions.
  const deduped = [];
  let lastKey = "";
  for (const c of candidates) {
    const key = `${Math.round(c.w / 20)}x${Math.round(c.h / 20)}`;
    if (key === lastKey) continue;
    deduped.push(c);
    lastKey = key;
  }
  console.log(`  → ${deduped.length} after de-dupe`);

  // No cap — the user asked for the FULL book preview. Earlier
  // version capped at 14 photos for a quick teaser; this run emits
  // every interior photo page that survived the filter.
  const chosen = deduped;

  const manifest = [];
  for (let i = 0; i < chosen.length; i++) {
    const c = chosen[i];
    const id = `${String(i + 1).padStart(3, "0")}-${suffix()}`;
    const variants = {};
    for (const w of SIZES) {
      const targetW = Math.min(w, c.w);
      // Resize → watermark → encode. Watermark sized to the resized
      // canvas so the text scales with the variant; this keeps the
      // 800px and 1200px versions both readable but proportionate.
      const resized = await sharp(c.buf)
        .resize({ width: targetW, withoutEnlargement: true })
        .toBuffer({ resolveWithObject: true });
      const wm = watermarkSvg(resized.info.width, resized.info.height);
      const stamped = await sharp(resized.data)
        .composite([{ input: wm, gravity: "southeast" }])
        .webp({ quality: 82 })
        .toBuffer();
      const fname = `pg-${id}@${w}.webp`;
      await writeFile(join(OUT, "photos", fname), stamped);
      variants[w] = `/from-above/photos/${fname}`;
    }
    const finalMeta = await sharp(join(OUT, "photos", `pg-${id}@1200.webp`)).metadata();
    manifest.push({
      id: `pg-${id}`,
      src: variants[1200],
      srcSet: SIZES.map((w) => `${variants[w]} ${w}w`).join(", "),
      width: finalMeta.width,
      height: finalMeta.height,
      orient: (finalMeta.width || 0) >= (finalMeta.height || 0) ? "landscape" : "portrait",
    });
    if ((i + 1) % 10 === 0 || i === chosen.length - 1) {
      console.log(`  → ${i + 1}/${chosen.length}`);
    }
  }

  await writeFile(
    join(OUT, "manifest.json"),
    JSON.stringify({ cover: "/from-above/cover-front.webp", photos: manifest }, null, 2),
  );
  console.log(`done: ${manifest.length} pages + 1 cover`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
