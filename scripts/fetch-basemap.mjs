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
import { join } from "node:path";

const OUT = "public/basemap/frederick-county.pmtiles";
const BBOX = "-77.75,39.15,-77.05,39.75";
const PLANET_BUILD = "https://build.protomaps.com/20260805.pmtiles";
const CLI_VERSION = "1.28.0";
const CLI_URL = `https://github.com/protomaps/go-pmtiles/releases/download/v${CLI_VERSION}/go-pmtiles_${CLI_VERSION}_Linux_x86_64.tar.gz`;
const MIN_PLAUSIBLE_BYTES = 10_000_000;

if (existsSync(OUT) && statSync(OUT).size > MIN_PLAUSIBLE_BYTES) {
  console.log(`fetch-basemap: ${OUT} present, skipping.`);
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
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
