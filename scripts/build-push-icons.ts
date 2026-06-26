/**
 * build-push-icons.ts — generate the Web Push notification assets.
 *
 * The service worker's push handler references `/icons/icon-192.png` and
 * `/icons/badge-72.png` (src/app/sw.js/route.ts). Those PNGs did not exist —
 * only icon.svg — so every delivered push fell back to the OS placeholder.
 *
 * This rasterizes the brand mark (matching public/icons/icon.svg and the
 * favicon in src/app/icon.tsx) into the two committed PNGs the OS fetches when
 * the app is CLOSED (so they must be static files, not a runtime route):
 *
 *   - icon-192.png : 192x192, OPAQUE. The full brand mark — Spruce ground,
 *                    cream ring, vermilion center.
 *   - badge-72.png : 72x72, TRANSPARENT monochrome silhouette. Android uses
 *                    ONLY the alpha channel for the status-bar badge and tints
 *                    it, so this is a white-on-transparent ring + dot.
 *
 * Re-run after any brand recolor: `npx tsx scripts/build-push-icons.ts`
 * (and, because /icons/(.*) is immutable-cached, bump the filename if you
 * ever change the design so clients re-fetch it).
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve(process.cwd(), "public/icons");

// Full-color mark — opaque Spruce ground, cream ring, vermilion center.
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#16352B"/>
  <circle cx="256" cy="256" r="120" fill="none" stroke="#EEE6D4" stroke-width="32"/>
  <circle cx="256" cy="256" r="44" fill="#E14328"/>
</svg>`;

// Monochrome silhouette on transparent — Android tints by alpha only.
const BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
  <circle cx="36" cy="36" r="22" fill="none" stroke="#ffffff" stroke-width="7"/>
  <circle cx="36" cy="36" r="9" fill="#ffffff"/>
</svg>`;

async function render(svg: string, size: number, file: string) {
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  const dest = path.join(OUT, file);
  await writeFile(dest, png);
  console.log(`wrote ${dest} (${png.length} bytes, ${size}x${size})`);
}

async function main() {
  await render(ICON_SVG, 192, "icon-192.png");
  await render(BADGE_SVG, 72, "badge-72.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
