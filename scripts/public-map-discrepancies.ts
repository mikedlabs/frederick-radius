/**
 * Build a local-only review queue from downloaded OSM, Overture, or GIS
 * GeoJSON. This script makes no network calls and never writes app data.
 *
 * Examples:
 *   npx tsx scripts/public-map-discrepancies.ts \
 *     --overture /tmp/overture-frederick.geojson \
 *     --osm src/data/osm-amenities/public_restrooms.geojson
 *
 *   npx tsx scripts/public-map-discrepancies.ts \
 *     --gis /tmp/approved-public-facilities.geojson \
 *     --gis-entity amenity --gis-kind restroom \
 *     --gis-source-url https://example.gov/dataset
 *
 * The default output is ignored by git:
 *   scripts/reports/public-map-discrepancies.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import AMENITIES_RAW from "@/data/amenities.json" with { type: "json" };
import PLACES_RAW from "@/data/places-client.json" with { type: "json" };
import {
  buildPublicMapDiscrepancyReport,
  normalizeGisFeature,
  normalizeOsmAmenityFeature,
  normalizeOverturePlaceFeature,
  osmSourceRefFromRadiusAmenityId,
  type GisFeatureDefaults,
  type PublicMapCandidate,
  type RadiusMapEntity,
} from "@/lib/quality/public-map-discrepancies";

type GeoJsonFeatureCollection = { features?: unknown[] };
type PlaceRow = {
  slug: string;
  name: string;
  category?: string;
  address?: string;
  google_place_id?: string;
  geom: { lng: number; lat: number };
};
type AmenityRow = {
  id: string;
  name: string;
  kind: string;
  lng: number;
  lat: number;
};

function valuesFor(name: string): string[] {
  const out: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) out.push(process.argv[index + 1]);
  }
  return out;
}

function valueFor(name: string): string | undefined {
  return valuesFor(name)[0];
}

function readFeatures(path: string): unknown[] {
  const parsed = JSON.parse(readFileSync(resolve(path), "utf8")) as GeoJsonFeatureCollection;
  if (!Array.isArray(parsed.features)) throw new Error(`${path} is not a GeoJSON FeatureCollection`);
  return parsed.features;
}

function printHelp(): void {
  console.log("\nPublic map discrepancy review — no source snapshots supplied.\n");
  console.log("Accepted local GeoJSON inputs:");
  console.log("  --overture FILE                  Overture place extract (repeatable)");
  console.log("  --osm FILE                       OSM amenity snapshot (repeatable)");
  console.log("  --gis FILE --gis-entity TYPE     reviewed GIS extract (repeatable)");
  console.log("  --gis-kind KIND                  default amenity kind for GIS rows");
  console.log("  --gis-source-url URL             provenance URL for GIS rows");
  console.log("  --out FILE                       local report path\n");
  console.log("No network calls are made. No public data is changed.\n");
}

function main(): void {
  const overturePaths = valuesFor("--overture");
  const osmPaths = valuesFor("--osm");
  const gisPaths = valuesFor("--gis");
  if (overturePaths.length + osmPaths.length + gisPaths.length === 0) {
    printHelp();
    return;
  }

  const gisEntity = valueFor("--gis-entity");
  if (gisPaths.length > 0 && gisEntity !== "place" && gisEntity !== "amenity") {
    throw new Error("--gis-entity must be place or amenity when --gis is supplied");
  }
  const gisDefaults: GisFeatureDefaults | undefined = gisEntity
    ? {
        entityKind: gisEntity as GisFeatureDefaults["entityKind"],
        amenityKind: valueFor("--gis-kind"),
        sourceUrl: valueFor("--gis-source-url"),
      }
    : undefined;

  const candidates: PublicMapCandidate[] = [];
  for (const path of overturePaths) {
    for (const feature of readFeatures(path)) {
      const candidate = normalizeOverturePlaceFeature(feature as never);
      if (candidate) candidates.push(candidate);
    }
  }
  for (const path of osmPaths) {
    for (const feature of readFeatures(path)) {
      const candidate = normalizeOsmAmenityFeature(feature as never);
      if (candidate) candidates.push(candidate);
    }
  }
  for (const path of gisPaths) {
    for (const feature of readFeatures(path)) {
      const candidate = normalizeGisFeature(feature as never, gisDefaults!);
      if (candidate) candidates.push(candidate);
    }
  }

  const places = PLACES_RAW as PlaceRow[];
  const amenities = AMENITIES_RAW as AmenityRow[];
  const radiusEntities: RadiusMapEntity[] = [
    ...places.map((place) => ({
      id: place.slug,
      entityKind: "place" as const,
      name: place.name,
      category: place.category,
      address: place.address,
      sourceRefs: place.google_place_id ? [`google:${place.google_place_id.toLowerCase()}`] : undefined,
      lng: place.geom.lng,
      lat: place.geom.lat,
    })),
    ...amenities.map((amenity) => {
      const osmRef = osmSourceRefFromRadiusAmenityId(amenity.id);
      return {
        id: amenity.id,
        entityKind: "amenity" as const,
        name: amenity.name,
        amenityKind: amenity.kind,
        sourceRefs: osmRef ? [osmRef] : undefined,
        lng: amenity.lng,
        lat: amenity.lat,
      };
    }),
  ];

  const report = buildPublicMapDiscrepancyReport(candidates, radiusEntities);
  const out = resolve(valueFor("--out") ?? "scripts/reports/public-map-discrepancies.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

  console.log("\nPublic map discrepancy review:");
  console.log(`  Scanned          ${report.scanned}`);
  console.log(`  Likely missing   ${report.summary.likelyMissing}`);
  console.log(`  Possible stale   ${report.summary.possibleStale}`);
  console.log(`  Identity drift   ${report.summary.identityDrift}`);
  console.log(`  Ignored          ${report.ignored}`);
  console.log(`  Wrote            ${out}`);
  console.log("\nHuman review is required. No app data was mutated.\n");
}

main();
