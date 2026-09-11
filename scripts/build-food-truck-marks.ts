/**
 * Rebuilds curated food-truck identity assets from vendor-controlled sources.
 *
 * The review manifest is intentionally hand-curated after `audit:vendor-media`
 * runs. This builder never promotes a newly discovered image on its own.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import MARKS from "../src/data/food-truck-marks.json";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "public", "food-truck-marks");
const MAX_BYTES = 8 * 1024 * 1024;

async function buildMark(
  slug: string,
  entry: { file: string; source: string },
): Promise<void> {
  const response = await fetch(entry.source, {
    headers: {
      "User-Agent":
        "FrederickRadiusMediaAudit/1.0 (+https://frederickradius.app/trust)",
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,*/*;q=0.5",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(18_000),
  });
  if (!response.ok) throw new Error(`${slug}: source returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    throw new Error(`${slug}: source asset has an invalid size (${bytes.length} bytes)`);
  }

  const output = path.join(ROOT, "public", entry.file.replace(/^\//, ""));
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(bytes, { failOn: "none" })
    .trim({ threshold: 8 })
    .resize({
      width: 600,
      height: 520,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: 60,
      bottom: 60,
      left: 20,
      right: 20,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(output);
  process.stdout.write(`Built ${path.relative(ROOT, output)}\n`);
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const [slug, entry] of Object.entries(MARKS)) {
    await buildMark(slug, entry);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
