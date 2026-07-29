/**
 * Frederick County GIS — authoritative geometry from the county's own
 * ArcGIS REST server (fcgis.frederickcountymd.gov), surfaced as map
 * layers. Preferred over OpenStreetMap approximations for the things
 * the county publishes itself.
 *
 * Verified endpoints (via the gis-fcgmd.opendata.arcgis.com DCAT
 * catalog): the Municipalities polygon layer (MUNIC = town name) and
 * the County Parks point layer (Name / Address / CityMuni). The REST
 * `query` endpoint returns WGS84 GeoJSON directly with outSR=4326.
 *
 * Runtime integration with a weekly revalidate and graceful empty on failure.
 * Radius reads only allowlisted fields from the official public service,
 * credits the County, and does not expose a mirrored download.
 */
import { EMPTY_LINE_FC, type MapLineFC } from "@/components/map/types";
import { MUNICIPALITIES } from "@/data/municipalities";
import { slimGeometryFC } from "@/lib/geo/slim-geometry";
import { frederickCountySourceEnabled } from "@/lib/integrations/fcCountySource";

// Display-slimming for the boundary overlays (payload audit 2026-07-02:
// raw county GIS shipped 439 KB of 17-digit coordinates into /map's HTML).
// 5 decimals ≈ 1.1 m; 0.0002° ≈ 22 m tolerance — both invisible under a
// hairline boundary stroke at county zoom. Applied in the GETTERS, not the
// pure normalizers, so the normalizer unit tests keep asserting source
// fidelity.
const BOUNDARY_SLIM = { decimals: 5, tolerance: 0.0002 } as const;

const MUNI_URL =
  "https://fcgis.frederickcountymd.gov/server_pub/rest/services/Basemap/Municipalities/MapServer/0/query" +
  "?where=1%3D1&outFields=MUNIC&outSR=4326&f=geojson";

const PARKS_URL =
  "https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Parks/MapServer/0/query" +
  "?where=1%3D1&outFields=Name,Address,CityMuni&outSR=4326&f=geojson";

const TIMEOUT_MS = 15_000;

function canonicalMunicipality(rawName: string): {
  name: string;
  slug: string;
} {
  const normalized = rawName
    .toLowerCase()
    .replace(/^(?:city|town|village)\s+of\s+/, "")
    .replace(/\b(?:city|town|village)\b/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const match = MUNICIPALITIES.find(
    (municipality) =>
      municipality.slug === normalized ||
      municipality.name
        .toLowerCase()
        .replace(/\b(?:city|town|village)\b/g, "")
        .trim()
        .replace(/[^a-z0-9]+/g, "-") === normalized,
  );
  return {
    name: match?.name ?? rawName,
    slug: match?.slug ?? normalized,
  };
}

/**
 * Pure: ArcGIS GeoJSON FeatureCollection → a MapLineFC of municipal
 * polygons carrying the County name plus Radius's canonical display name and
 * slug. Drops anything that is not a Polygon / MultiPolygon. Exported for
 * unit tests (no network).
 */
export function normalizeMunicipalBoundaries(raw: unknown): MapLineFC {
  const feats = (raw as { features?: unknown[] })?.features;
  if (!Array.isArray(feats)) return EMPTY_LINE_FC;
  const out: MapLineFC["features"] = [];
  for (const f of feats as Array<{ geometry?: { type?: string }; properties?: Record<string, unknown> }>) {
    const t = f?.geometry?.type;
    if (t !== "Polygon" && t !== "MultiPolygon") continue;
    const sourceName = String(f.properties?.MUNIC ?? "").trim();
    if (!sourceName) continue;
    const municipality = canonicalMunicipality(sourceName);
    out.push({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        name: municipality.name,
        slug: municipality.slug,
        sourceName,
      },
    });
  }
  return { type: "FeatureCollection", features: out };
}

export async function getMunicipalBoundaries(): Promise<MapLineFC> {
  if (!frederickCountySourceEnabled("fc_municipal_boundaries")) {
    return EMPTY_LINE_FC;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(MUNI_URL, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 604_800 },
    });
    if (!res.ok) return EMPTY_LINE_FC;
    return slimGeometryFC(normalizeMunicipalBoundaries(await res.json()), BOUNDARY_SLIM);
  } catch {
    return EMPTY_LINE_FC;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * County boundary outline (data brief 6.1): the quiet constant edge of
 * Frederick County, drawn always-on under the place pins so the map
 * reads as a county field guide, not a generic basemap.
 *
 * Unlike municipal boundaries, the county outline is committed static
 * GeoJSON from U.S. Census TIGERweb (GEOID 24021), so this reads the file
 * rather than calling County GIS. TIGER/Line is U.S. Government data.
 * Returns the polygon FC; the map draws its edges with a line layer.
 */
export async function getCountyBoundary(): Promise<MapLineFC> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const raw = await readFile(
      join(process.cwd(), "public", "overlays", "county-boundary.geojson"),
      "utf-8",
    );
    return slimGeometryFC(JSON.parse(raw) as MapLineFC, BOUNDARY_SLIM);
  } catch {
    return EMPTY_LINE_FC;
  }
}

export type CountyPark = {
  name: string;
  address?: string;
  municipality?: string;
  lng: number;
  lat: number;
};

const FREDERICK_BBOX = { south: 39.265, west: -77.7, north: 39.745, east: -77.15 };

/**
 * Pure: ArcGIS GeoJSON points → CountyPark[]. Drops nameless and
 * out-of-county records. Exported for unit tests.
 */
export function normalizeCountyParks(raw: unknown): CountyPark[] {
  const feats = (raw as { features?: unknown[] })?.features;
  if (!Array.isArray(feats)) return [];
  const out: CountyPark[] = [];
  for (const f of feats as Array<{
    geometry?: { type?: string; coordinates?: unknown };
    properties?: Record<string, unknown>;
  }>) {
    if (f?.geometry?.type !== "Point") continue;
    const c = f.geometry.coordinates;
    if (!Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number") continue;
    const [lng, lat] = c as [number, number];
    if (lat < FREDERICK_BBOX.south || lat > FREDERICK_BBOX.north) continue;
    if (lng < FREDERICK_BBOX.west || lng > FREDERICK_BBOX.east) continue;
    const name = String(f.properties?.Name ?? "").trim();
    if (!name) continue;
    out.push({
      name,
      address: f.properties?.Address ? String(f.properties.Address).trim() : undefined,
      municipality: f.properties?.CityMuni ? String(f.properties.CityMuni).trim() : undefined,
      lng,
      lat,
    });
  }
  return out;
}

export async function getCountyParks(): Promise<CountyPark[]> {
  if (!frederickCountySourceEnabled("fc_county_parks")) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(PARKS_URL, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 604_800 },
    });
    if (!res.ok) return [];
    return normalizeCountyParks(await res.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
