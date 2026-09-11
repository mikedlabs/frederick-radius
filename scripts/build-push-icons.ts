/**
 * build-push-icons.ts — generate the Web Push notification assets.
 *
 * The service worker's push handler references `/icons/icon-192.png` and
 * `/icons/badge-72.png` (src/app/sw.js/route.ts). Those PNGs did not exist —
 * only icon.svg — so every delivered push fell back to the OS placeholder.
 *
 * This builds every platform icon from the canonical brand contract. Keeping
 * favicon, Apple, PWA, maskable, and notification artwork in one generator
 * prevents small geometry/color differences from accumulating across surfaces.
 *
 *   - icon-192.png : 192x192, OPAQUE. The full three-arc Ripple on its Brick
 *                    squircle.
 *   - icon-512.png : 512x512 high-resolution launcher fallback.
 *   - icon-maskable-512.png : full-bleed Brick with the Ripple held inside
 *                    the mask-safe center.
 *   - badge-72.png : 72x72, TRANSPARENT monochrome silhouette. Android uses
 *                    ONLY the alpha channel for the status-bar badge and tints
 *                    it, so this is a white-on-transparent ring + dot.
 *
 * Re-run after any brand recolor or Ripple adjustment:
 * `npx tsx scripts/build-push-icons.ts`.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BRAND, RIPPLE_GEOMETRY, type RippleDetail } from "../src/lib/brand";

const OUT = path.resolve(process.cwd(), "public/icons");
const APP = path.resolve(process.cwd(), "src/app");

function ripple(detail: RippleDetail, color: string, transform = ""): string {
  const geometry = RIPPLE_GEOMETRY[detail];
  const opticalTransform = `translate(0 ${geometry.opticalOffsetY})`;
  const groupTransform = [transform, opticalTransform].filter(Boolean).join(" ");
  return `<g transform="${groupTransform}">
    <g fill="none" stroke="${color}" stroke-linecap="round" stroke-width="${geometry.strokeWidth}">
      ${geometry.paths.map((d, index) => `<path d="${d}" stroke-opacity="${geometry.opacities[index]}"/>`).join("\n      ")}
    </g>
    <circle cx="50" cy="${geometry.baseline}" r="${geometry.dotRadius}" fill="${color}"/>
  </g>`;
}

function svg(body: string, viewBox = "0 0 100 100"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
}

// `purpose:any`: branded squircle with transparent corners. The mark is
// clipped to the tile and uses the full canonical geometry at 48px+.
const ICON_SVG = svg(`<defs><clipPath id="tile"><path d="${RIPPLE_GEOMETRY.squircle}"/></clipPath></defs>
  <path d="${RIPPLE_GEOMETRY.squircle}" fill="${BRAND.colors.brick}"/>
  <g clip-path="url(#tile)">${ripple("full", BRAND.colors.cream, "translate(14 14) scale(.72)")}</g>`);

// Monochrome favicon-scale Ripple — Android tints by alpha only, so the
// simplified one-arc form survives at notification-badge size.
const BADGE_SVG = svg(ripple("favicon", "#FFFFFF"));

// `purpose:maskable`: full-bleed ground, with every essential mark pixel held
// inside the standard 80% safe circle so Android's masks cannot crop an arc.
const MASKABLE_SVG = svg(`<rect width="100" height="100" fill="${BRAND.colors.brick}"/>
  ${ripple("full", BRAND.colors.cream, "translate(19 19) scale(.62)")}`);

// iOS supplies its own rounded mask, so Apple gets an opaque full-bleed tile.
const APPLE_SVG = svg(`<rect width="100" height="100" fill="${BRAND.colors.brick}"/>
  ${ripple("full", BRAND.colors.cream, "translate(14 14) scale(.72)")}`);

// Browser tabs need the simplified mark, not three low-opacity lines that
// disappear at 16px.
const FAVICON_SVG = svg(`<rect width="100" height="100" fill="${BRAND.colors.brick}"/>
  ${ripple("favicon", BRAND.colors.cream)}`);

const MARK_SVG = svg(ripple("full", "currentColor"));

async function renderPng(source: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(source)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

async function render(source: string, size: number, file: string) {
  const png = await renderPng(source, size);
  const dest = path.join(OUT, file);
  await writeFile(dest, png);
  console.log(`wrote ${dest} (${png.length} bytes, ${size}x${size})`);
}

/** Minimal PNG-backed ICO encoder; modern browsers support PNG image entries. */
function encodeIco(images: Array<{ size: number; png: Buffer }>): Buffer {
  const headerSize = 6 + images.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = headerSize;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  await Promise.all([
    writeFile(path.join(OUT, "icon.svg"), `${ICON_SVG}\n`),
    writeFile(path.join(OUT, "icon-maskable.svg"), `${MASKABLE_SVG}\n`),
    writeFile(path.join(OUT, "mark.svg"), `${MARK_SVG}\n`),
    render(ICON_SVG, 192, "icon-192.png"),
    render(ICON_SVG, 512, "icon-512.png"),
    render(MASKABLE_SVG, 512, "icon-maskable-512.png"),
    render(BADGE_SVG, 72, "badge-72.png"),
  ]);

  const [icon32, apple180, ...faviconPngs] = await Promise.all([
    renderPng(FAVICON_SVG, 32),
    renderPng(APPLE_SVG, 180),
    ...[16, 32, 48].map((size) => renderPng(FAVICON_SVG, size)),
  ]);
  await Promise.all([
    writeFile(path.join(APP, "icon.png"), icon32),
    writeFile(path.join(APP, "apple-icon.png"), apple180),
    writeFile(
      path.join(APP, "favicon.ico"),
      encodeIco([16, 32, 48].map((size, index) => ({ size, png: faviconPngs[index] }))),
    ),
  ]);
  console.log("wrote src/app icon.png, apple-icon.png, and multi-size favicon.ico");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
