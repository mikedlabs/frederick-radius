/**
 * Fetch the self-hosted county basemap extract (task #36).
 *
 * public/basemap/frederick-county.pmtiles is a ~30 MB binary that the
 * repo-size gate rightly refuses to track: every re-extract rewrites the
 * whole file, which is git-history poison. Instead it is produced at
 * build time: download the pinned go-pmtiles release and extract the
 * pinned Protomaps daily build for the county bbox. Both pins make the
 * output reproducible; bump PLANET_BUILD deliberately when the county
 * needs fresher OSM data (roads change slowly; quarterly is plenty).
 *
 * Behavior: file already present -> no-op (local dev after first run,
 * and CI caches). Missing and fetchable -> extract (~20 s, ~31 MB
 * transfer). Missing and unfetchable -> hard fail on Vercel (a deploy
 * without the basemap would silently blank the bench), soft warn
 * locally (sandboxes without GitHub egress still run the app; the
 * bench shows its own tile error).
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const OUT = "public/basemap/frederick-county.pmtiles";
const BBOX = "-77.75,39.15,-77.05,39.75";
const PLANET_BUILD = "https://build.protomaps.com/20260805.pmtiles";
const CLI_VERSION = "1.28.0";
const CLI_URL = `https://github.com/protomaps/go-pmtiles/releases/download/v${CLI_VERSION}/go-pmtiles_${CLI_VERSION}_Linux_x86_64.tar.gz`;
const MIN_PLAUSIBLE_BYTES = 10_000_000;

// Sprites and glyphs must be served from a PUBLIC path. They used to ride a
// relay under /admin/basemap/assets, which Basic Auth gates — fine for the
// judging bench, impossible for a public map, whose visitors would get 401s
// instead of fonts. Vendored here beside the tiles, gitignored like them.
const ASSET_UPSTREAM = "https://protomaps.github.io/basemaps-assets";
const SPRITES = [
  "sprites/v4/light.json",
  "sprites/v4/light.png",
  "sprites/v4/light@2x.json",
  "sprites/v4/light@2x.png",
];
// The flavor's three stacks, Latin ranges only: Basic Latin + Supplement,
// Extended-A/B, and the punctuation block labels actually reach for. The
// remaining 250 ranges per stack are CJK and friends this county never
// renders, and fetching them would turn a 15-file step into 750.
const FONT_STACKS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
const GLYPH_RANGES = ["0-255", "256-511", "512-767", "8192-8447"];

// The on-disk path must be the DECODED name. MapLibre requests
// /fonts/Noto%20Sans%20Regular/0-255.pbf, and a static file server decodes
// that before matching, so it looks for a directory containing real spaces.
// Writing the encoded form produces a directory literally named
// "Noto%20Sans%20Regular", which then 404s on every glyph.
async function fetchAsset({ url, path }) {
  const dest = join("public/basemap", path);
  if (existsSync(dest) && statSync(dest).size > 0) return;
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync("curl", ["-fsSL", "--create-dirs", "-o", dest, `${ASSET_UPSTREAM}/${url}`], {
    stdio: "inherit",
  });
}

async function fetchStyleAssets() {
  for (const sprite of SPRITES) await fetchAsset({ url: sprite, path: sprite });
  for (const stack of FONT_STACKS) {
    for (const range of GLYPH_RANGES) {
      await fetchAsset({
        url: `fonts/${encodeURIComponent(stack)}/${range}.pbf`,
        path: `fonts/${stack}/${range}.pbf`,
      });
    }
  }
  console.log(
    `fetch-basemap: ${SPRITES.length} sprite file(s) and ${FONT_STACKS.length * GLYPH_RANGES.length} glyph range(s) present.`,
  );
}

if (existsSync(OUT) && statSync(OUT).size > MIN_PLAUSIBLE_BYTES) {
  console.log(`fetch-basemap: ${OUT} present, skipping the extract.`);
  try {
    await fetchStyleAssets();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  process.exit(0);
}

function fail(message) {
  if (process.env.VERCEL) {
    console.error(`fetch-basemap: ${message}`);
    process.exit(1);
  }
  console.warn(`fetch-basemap: ${message} (non-Vercel environment; continuing without the county basemap — the admin bench will show a tile error until it exists)`);
  process.exit(0);
}

try {
  const work = join(tmpdir(), `pmtiles-cli-${CLI_VERSION}`);
  const bin = join(work, "pmtiles");
  if (!existsSync(bin)) {
    mkdirSync(work, { recursive: true });
    const tarball = join(work, "cli.tar.gz");
    console.log(`fetch-basemap: downloading pmtiles CLI v${CLI_VERSION}`);
    execFileSync("curl", ["-fsSL", "-o", tarball, CLI_URL], { stdio: "inherit" });
    execFileSync("tar", ["-xzf", tarball, "-C", work, "pmtiles"], { stdio: "inherit" });
    chmodSync(bin, 0o755);
  }
  mkdirSync("public/basemap", { recursive: true });
  const tmpOut = `${OUT}.tmp`;
  rmSync(tmpOut, { force: true });
  console.log(`fetch-basemap: extracting county bbox from ${PLANET_BUILD}`);
  execFileSync(bin, ["extract", PLANET_BUILD, tmpOut, `--bbox=${BBOX}`], { stdio: "inherit" });
  if (!existsSync(tmpOut) || statSync(tmpOut).size < MIN_PLAUSIBLE_BYTES) {
    throw new Error("extract produced an implausibly small archive");
  }
  renameSync(tmpOut, OUT);
  console.log(`fetch-basemap: wrote ${OUT} (${(statSync(OUT).size / 1e6).toFixed(1)} MB)`);
  await fetchStyleAssets();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
