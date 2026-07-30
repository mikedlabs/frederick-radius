/**
 * Prevent unapproved Frederick County derivatives from quietly returning.
 *
 * Public access is not itself a reuse grant. Runtime adapters have per-source
 * gates; this audit covers committed/static copies that would bypass them.
 *
 * `--clean` removes old fc-gis recreation rows from places-discovered.json.
 * It never deletes files; tracked static bundles must be reviewed and removed
 * explicitly.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FORBIDDEN_STATIC_FILES = [
  "public/overlays/parks.geojson",
  "public/overlays/markets.geojson",
  "public/overlays/bridges.geojson",
  "public/overlays/historic.geojson",
  "src/data/fire-stations.json",
  "src/data/libraries.json",
  "src/data/parks.json",
  "src/data/park-amenities.json",
  "src/data/rec-locations.json",
  "src/data/rec-merge-plan.json",
] as const;

const RECREATION_LAYER_MARKER =
  "survey123_4590893d5fdc4e6ab6d653f985715200";

type PlaceRow = {
  source?: unknown;
  google_photo_url?: unknown;
};

function isUnapprovedCountyRecreationRow(row: PlaceRow): boolean {
  return (
    row.source === "fc-gis" ||
    row.source === "arcgis_fcgov" ||
    (
      typeof row.google_photo_url === "string" &&
      row.google_photo_url.includes(RECREATION_LAYER_MARKER)
    )
  );
}

function loadRows(path: string): PlaceRow[] {
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(value)) throw new Error(`${path} must contain an array`);
  return value as PlaceRow[];
}

export function auditCountyDerivedData(root = process.cwd()): string[] {
  const issues = FORBIDDEN_STATIC_FILES.filter((path) =>
    existsSync(resolve(root, path)),
  ).map((path) => `${path}: unapproved County-derived static file is committed`);

  for (const relative of [
    "src/data/places-discovered.json",
    "src/data/places-client.json",
  ]) {
    const path = resolve(root, relative);
    if (!existsSync(path)) continue;
    const count = loadRows(path).filter(isUnapprovedCountyRecreationRow).length;
    if (count > 0) {
      issues.push(
        `${relative}: ${count} unapproved County recreation row(s) bypass the runtime gate`,
      );
    }
  }
  return issues;
}

function cleanPlaceRows(root = process.cwd()): number {
  let removed = 0;
  for (const [relative, pretty] of [
    ["src/data/places-discovered.json", true],
    ["src/data/places-client.json", false],
  ] as const) {
    const path = resolve(root, relative);
    const rows = loadRows(path);
    const kept = rows.filter((row) => !isUnapprovedCountyRecreationRow(row));
    removed += rows.length - kept.length;
    writeFileSync(
      path,
      pretty
        ? `${JSON.stringify(kept, null, 2)}\n`
        : JSON.stringify(kept),
    );
  }
  return removed;
}

function main(): void {
  if (process.argv.includes("--clean")) {
    console.log(
      `Removed ${cleanPlaceRows()} unapproved County recreation place row(s).`,
    );
  }
  const issues = auditCountyDerivedData();
  if (issues.length > 0) {
    console.error(`County-derived data audit failed (${issues.length}):`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log("County-derived data audit passed.");
}

main();
