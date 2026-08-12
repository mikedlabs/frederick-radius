/**
 * Fetch the self-hosted county basemap extract (task #36).
 *
 * public/basemap/frederick-county.pmtiles is a ~30 MB binary that the
 * repo-size gate rightly refuses to track: every re-extract rewrites the
 * whole file, which is git-history poison. Instead it is produced at
 * build time: download the pinned go-pmtiles release and extract the newest
 * compatible Protomaps build for the county bbox. Ordinary daily archives are
 * retained for only a week, so the source is resolved from Protomaps' official
 * build index instead of pinning an expiring date. Set
 * PROTOMAPS_PLANET_BUILD_URL to use a self-hosted immutable source.
 *
 * Behavior: file already present -> no-op (local dev after first run,
 * and CI caches). Missing and fetchable -> extract (~20 s, ~31 MB
 * transfer). Missing and unfetchable -> hard fail on CI and Vercel (a
 * green build without the basemap would ship blank maps), soft warn locally
 * (sandboxes without GitHub egress can still run the non-map surfaces).
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  basemapFailureMustStopBuild,
  resolveProtomapsPlanetBuild,
  resolvePmtilesRelease,
} from "./lib/basemap-platform.mjs";

const OUT = "public/basemap/frederick-county.pmtiles";
const BBOX = "-77.75,39.15,-77.05,39.75";
const CLI_VERSION = "1.28.0";
const MIN_CLI_BYTES = 1_000_000;
const MIN_PLAUSIBLE_BYTES = 10_000_000;
const CURL_DOWNLOAD_ARGS = [
  "-fsSL",
  "--retry",
  "3",
  "--retry-delay",
  "2",
  "--retry-all-errors",
];

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
  execFileSync(
    "curl",
    [
      ...CURL_DOWNLOAD_ARGS,
      "--create-dirs",
      "-o",
      dest,
      `${ASSET_UPSTREAM}/${url}`,
    ],
    { stdio: "inherit" },
  );
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
  if (basemapFailureMustStopBuild()) {
    console.error(`fetch-basemap: ${message}`);
    process.exit(1);
  }
  console.warn(`fetch-basemap: ${message} (local non-CI environment; continuing without the county basemap — map surfaces will show their tile-error fallback until it exists)`);
  process.exit(0);
}

try {
  const release = resolvePmtilesRelease({
    version: CLI_VERSION,
    platform: process.platform,
    arch: process.arch,
  });
  // Include the host in the cache path. A Linux binary left by an earlier
  // build otherwise looks reusable on a Mac and fails later with ENOEXEC.
  const work = join(
    tmpdir(),
    `pmtiles-cli-${CLI_VERSION}-${release.cacheKey}`,
  );
  const bin = join(work, "pmtiles");
  const cachedBinaryIsUsable =
    existsSync(bin) && statSync(bin).size >= MIN_CLI_BYTES;
  if (!cachedBinaryIsUsable) {
    mkdirSync(work, { recursive: true });
    rmSync(bin, { force: true });
    const archive = join(work, release.archiveName);
    console.log(
      `fetch-basemap: downloading pmtiles CLI v${CLI_VERSION} for ${process.platform}/${process.arch}`,
    );
    execFileSync(
      "curl",
      [...CURL_DOWNLOAD_ARGS, "-o", archive, release.url],
      { stdio: "inherit" },
    );
    if (release.format === "zip") {
      execFileSync("unzip", ["-oq", archive, "-d", work], {
        stdio: "inherit",
      });
    } else {
      execFileSync("tar", ["-xzf", archive, "-C", work, "pmtiles"], {
        stdio: "inherit",
      });
    }
  }
  chmodSync(bin, 0o755);
  mkdirSync("public/basemap", { recursive: true });
  const tmpOut = `${OUT}.tmp`;
  rmSync(tmpOut, { force: true });
  const planetBuild = await resolveProtomapsPlanetBuild();
  console.log(
    `fetch-basemap: extracting county bbox from ${planetBuild.url} (${planetBuild.source})`,
  );
  execFileSync(bin, ["extract", planetBuild.url, tmpOut, `--bbox=${BBOX}`], {
    stdio: "inherit",
  });
  if (!existsSync(tmpOut) || statSync(tmpOut).size < MIN_PLAUSIBLE_BYTES) {
    throw new Error("extract produced an implausibly small archive");
  }
  renameSync(tmpOut, OUT);
  console.log(`fetch-basemap: wrote ${OUT} (${(statSync(OUT).size / 1e6).toFixed(1)} MB)`);
  await fetchStyleAssets();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
