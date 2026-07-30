/**
 * Refresh Frederick County's display boundary from U.S. Census TIGERweb.
 *
 * TIGER/Line is a U.S. Government work. This replaces the former transformed
 * Frederick County GIS copy with an independently reusable federal source.
 *
 * Usage:
 *   npm run refresh:county-boundary
 *   npm run refresh:county-boundary -- --input /path/to/response.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { slimGeometryFC } from "@/lib/geo/slim-geometry";

const SOURCE_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/9/query" +
  "?where=STATE%3D%2724%27%20AND%20COUNTY%3D%27021%27" +
  "&outFields=NAME%2CGEOID&outSR=4326&geometryPrecision=5&f=geojson";

type BoundaryFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  Record<string, unknown>
>;

type BoundaryCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  Record<string, unknown>
>;

function inputPath(): string | undefined {
  const index = process.argv.indexOf("--input");
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function loadRaw(): Promise<unknown> {
  const local = inputPath();
  if (local) return JSON.parse(await readFile(resolve(local), "utf8"));
  const response = await fetch(SOURCE_URL, {
    headers: { Accept: "application/geo+json, application/json" },
  });
  if (!response.ok) {
    throw new Error(`Census TIGERweb returned HTTP ${response.status}`);
  }
  return response.json();
}

function validate(raw: unknown): BoundaryFeature {
  const collection = raw as Partial<BoundaryCollection>;
  const features = Array.isArray(collection.features)
    ? collection.features
    : [];
  if (features.length !== 1) {
    throw new Error(`Expected one Frederick County feature; received ${features.length}`);
  }
  const feature = features[0] as BoundaryFeature;
  if (!["Polygon", "MultiPolygon"].includes(feature.geometry?.type ?? "")) {
    throw new Error("Census response did not contain polygon geometry");
  }
  if (
    String(feature.properties?.GEOID ?? "") !== "24021" ||
    String(feature.properties?.NAME ?? "") !== "Frederick County"
  ) {
    throw new Error("Census response was not Frederick County, Maryland (GEOID 24021)");
  }
  return feature;
}

async function main(): Promise<void> {
  const feature = validate(await loadRaw());
  const full: BoundaryCollection = {
    type: "FeatureCollection",
    features: [
      {
        ...feature,
        properties: {
          name: "Frederick County",
          geoid: "24021",
          source: "U.S. Census Bureau TIGERweb",
          source_url: SOURCE_URL,
          vintage: "2025",
        },
      },
    ],
  };
  const slim = slimGeometryFC(full, { decimals: 5, tolerance: 0.0002 });
  const geometry = slim.features[0]?.geometry;
  if (!geometry) {
    throw new Error("County boundary collapsed during display simplification");
  }
  const countyRing =
    geometry.type === "Polygon"
      ? geometry.coordinates[0]
      : geometry.coordinates
          .map((polygon) => polygon[0])
          .sort((a, b) => b.length - a.length)[0];
  if (!countyRing || countyRing.length < 4) {
    throw new Error("County boundary did not contain a usable outer ring");
  }

  await Promise.all([
    writeFile(
      resolve("public/overlays/county-boundary.geojson"),
      `${JSON.stringify(full)}\n`,
    ),
    writeFile(
      resolve("src/data/county-boundary.json"),
      `${JSON.stringify(geometry)}\n`,
    ),
    writeFile(
      resolve("src/data/county-ring.json"),
      `${JSON.stringify(countyRing)}\n`,
    ),
  ]);

  console.log(
    "Refreshed Frederick County boundary from U.S. Census TIGERweb (GEOID 24021).",
  );
}

void main();
