#!/usr/bin/env node
// Build the aerial-photo manifest from EXIF GPS in the seasons folder.
//
// Each drone photograph in /public/images/seasons/{spring|summer|fall|winter}/
// carries lat/lng/altitude + DateTimeOriginal in its EXIF. This script
// reads all of them at once via `exiftool -j` (one process, fast), filters
// to photos that ACTUALLY have GPS coordinates, and emits the manifest the
// map layer reads at request time.
//
// Output: public/images/seasons/aerial-manifest.json
//
//   [
//     {
//       "src":      "/images/seasons/spring/008.jpg",
//       "lat":      39.419365,
//       "lng":      -77.417737,
//       "altM":     226.7,
//       "takenAt":  "2023-05-04T11:28:06.000Z",   // UTC ISO
//       "season":   "spring"
//     },
//     ...
//   ]
//
// Run:  node scripts/build-aerial-manifest.mjs
//
// Requires exiftool on PATH (brew install exiftool).
import { execFile } from "node:child_process";
import { readdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";

const exec = promisify(execFile);
const SEASONS_DIR = "public/images/seasons";
const SEASONS = ["spring", "summer", "fall", "winter"];
const OUT = `${SEASONS_DIR}/aerial-manifest.json`;

async function listJpgs(season) {
  const dir = join(SEASONS_DIR, season);
  const files = await readdir(dir);
  return files
    .filter((f) => /\.jpe?g$/i.test(f))
    .map((f) => join(dir, f));
}

/** Convert "2023:05:04 07:28:06" → ISO UTC. ExifTool reports the wall
 *  clock from the drone's local time at the moment of capture; we treat
 *  it as Eastern unless the photo also carries an explicit offset (most
 *  drones don't). Frederick County is Eastern year-round, so this is
 *  the right assumption for our photos. */
function dtToIso(dt) {
  if (typeof dt !== "string") return null;
  const m = dt.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  // Eastern is UTC-4 in summer / UTC-5 in winter. Approximate via a
  // crude DST window (mid-March to early November) — good enough for
  // ordering and seasonal grouping; sub-hour accuracy isn't needed
  // for "where on the calendar was this taken."
  const isSummer = (Number(mo) > 3 && Number(mo) < 11) ||
    (Number(mo) === 3 && Number(d) >= 14) ||
    (Number(mo) === 11 && Number(d) <= 7);
  const offset = isSummer ? "-04:00" : "-05:00";
  const iso = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`).toISOString();
  return iso;
}

async function main() {
  console.log("scanning seasons folders…");
  const all = [];
  for (const season of SEASONS) {
    const files = await listJpgs(season);
    if (files.length === 0) {
      console.log(`  ${season}: 0 files`);
      continue;
    }
    // One exiftool process per season — handles 30-ish files in <1s.
    const { stdout } = await exec(
      "exiftool",
      [
        "-j",
        "-GPSLatitude#",
        "-GPSLongitude#",
        "-GPSAltitude#",
        "-GPSImgDirection#",
        "-DateTimeOriginal",
        ...files,
      ],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    const rows = JSON.parse(stdout);
    let kept = 0;
    for (const r of rows) {
      const lat = Number(r.GPSLatitude);
      const lng = Number(r.GPSLongitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      // Sanity: drop anything outside the Frederick County bbox so a
      // stray photo from a trip doesn't end up plotted in Maryland.
      if (lat < 39.0 || lat > 39.9) continue;
      if (lng < -77.9 || lng > -77.0) continue;
      const src = "/" + r.SourceFile.replace(/^public\//, "");
      all.push({
        src,
        lat,
        lng,
        altM: Number.isFinite(Number(r.GPSAltitude)) ? Number(r.GPSAltitude) : null,
        bearing: Number.isFinite(Number(r.GPSImgDirection)) ? Number(r.GPSImgDirection) : null,
        takenAt: dtToIso(r.DateTimeOriginal),
        season,
      });
      kept++;
    }
    console.log(`  ${season}: ${kept} / ${files.length} with GPS`);
  }
  // Sort newest-first so a viewer's eye lands on recent imagery before
  // older shots.
  all.sort((a, b) => (b.takenAt ?? "").localeCompare(a.takenAt ?? ""));
  await writeFile(OUT, JSON.stringify(all, null, 2));
  console.log(`done: ${all.length} aerial photos → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
