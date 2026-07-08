/**
 * build-place-hues — extract a per-business BRAND hue from each place's
 * Google photo, for the SavedWallet card grounds.
 *
 * Why build-time: the wallet is a client component reading a static JSON of
 * hex strings; no runtime image fetching, no layout-shifting color pops, no
 * Google quota spent per pageview. Boundary work, not render-time — the same
 * rule as the rest of the data pipeline.
 *
 * How: for every place in places-client.json with a google_photo_url, fetch
 * a TINY rendition (96px through the production next/image optimizer for
 * blob-hosted heroes — ~2KB each instead of ~370KB originals; the
 * /api/place-photo proxy directly, at w=200, for the handful of places still
 * on Google photo names). Decode with sharp, downsize to 48x48 raw RGB, and
 * hand the pixels to the pure math in src/lib/color/brandHue.ts:
 * saturation-weighted hue clustering with gray rejection, then the clamp
 * (S 0.35-0.75, L 0.30-0.55) and the WCAG AA guarantee — cream #EEE6D4 must
 * clear 4.5:1 on the wallet's `color-mix(in srgb, hue 60%, #16140E)` ground,
 * computed in-script via the same mix math, darkening L until it passes.
 *
 * Output: src/data/place-hues.json — { slug: "#RRGGBB" }, sorted, plus _doc.
 * Places whose photo is gray/monochrome (no brand hue), missing, or
 * undecodable are simply absent; the wallet falls back to its category
 * ground. Run: npm run build:place-hues
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { dominantHue, finalizeBrandHex } from "../src/lib/color/brandHue";

const ROOT = join(__dirname, "..");
const PROD = "https://frederickradius.app";
const BETA_COOKIE = process.env.FR_BETA_COOKIE ?? "";
const CONCURRENCY = 6;
const MAX_PHOTOS = 1500;
const SAMPLE_SIZE = 48; // 48x48 = 2304 pixels, plenty for a dominant hue

type ClientPlace = { slug: string; google_photo_url?: string };

/** Small rendition URL for a place photo (be polite: never the original). */
function tinyUrl(photoUrl: string): string {
  if (photoUrl.startsWith("/")) {
    // /api/place-photo?name=...&w=800&slug=... — our own Google photo proxy.
    // Shrink the requested width; the route passes it through to Google.
    const u = new URL(photoUrl, PROD);
    u.searchParams.set("w", "200");
    return u.toString();
  }
  // Blob-hosted hero: production's next/image optimizer serves a cached 96px
  // JPEG (~2KB). w=96 is in the default imageSizes; q must be in the app's
  // qualities allowlist (70, 75).
  return `${PROD}/_next/image?url=${encodeURIComponent(photoUrl)}&w=96&q=70`;
}

async function fetchPhoto(photoUrl: string): Promise<Buffer | null> {
  const url = tinyUrl(photoUrl);
  try {
    const res = await fetch(url, {
      headers: BETA_COOKIE ? { cookie: `fr_beta=${BETA_COOKIE}` } : {},
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    // The place-photo proxy serves an SVG placeholder for stale Google photo
    // names — no brand color there, and sharp raw decode wants raster input.
    if (!/image\/(jpeg|png|webp|avif|gif)/.test(type)) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function extractHex(photo: Buffer): Promise<string | null> {
  try {
    const { data } = await sharp(photo)
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const hsl = dominantHue(data);
    if (!hsl) return null;
    return finalizeBrandHex(hsl);
  } catch {
    return null;
  }
}

async function main() {
  const places: ClientPlace[] = JSON.parse(
    readFileSync(join(ROOT, "src/data/places-client.json"), "utf8"),
  );
  const withPhoto = places
    .filter((p) => p.slug && p.google_photo_url)
    .slice(0, MAX_PHOTOS);
  console.log(`${withPhoto.length} places with photos (of ${places.length})`);

  const hues: Record<string, string> = {};
  let done = 0;
  let fetchFail = 0;
  let noHue = 0;

  // Small-concurrency worker pool: polite to prod and to Google.
  let next = 0;
  async function worker() {
    while (next < withPhoto.length) {
      const p = withPhoto[next++];
      const photo = await fetchPhoto(p.google_photo_url!);
      if (!photo) {
        fetchFail++;
      } else {
        const hex = await extractHex(photo);
        if (hex) hues[p.slug] = hex;
        else noHue++;
      }
      done++;
      if (done % 100 === 0) console.log(`  ${done}/${withPhoto.length}…`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const sorted = Object.fromEntries(
    Object.entries(hues).sort(([a], [b]) => a.localeCompare(b)),
  );
  const out = {
    _doc:
      "Per-business brand hue for SavedWallet card grounds, extracted from each place's Google photo by scripts/build-place-hues.ts (npm run build:place-hues). Dominant vibrant hue, clamped to S 0.35-0.75 / L 0.30-0.55, guaranteed WCAG AA 4.5:1 for cream text on the wallet's 60% ink mix. Absent slug = no photo or no confident brand hue; the wallet falls back to its category ground. Do not hand-edit; re-run the script.",
    ...sorted,
  };
  writeFileSync(
    join(ROOT, "src/data/place-hues.json"),
    JSON.stringify(out, null, 1) + "\n",
  );
  console.log(
    `wrote ${Object.keys(sorted).length} hues (${fetchFail} fetch-failed/placeholder, ${noHue} no confident hue)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
