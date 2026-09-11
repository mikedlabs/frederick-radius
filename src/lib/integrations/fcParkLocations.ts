/**
 * Frederick County park-location enrichment.
 *
 * The former runtime URL used `gis.frederickco.gov`, which is Frederick
 * County, Colorado—not Frederick County, Maryland. The Maryland bounding-box
 * check happened to discard every record, but the request and source comments
 * were still wrong. Runtime enrichment now adapts the verified Maryland
 * County park-points feed. The old pure normalizer remains for fixture and
 * regression coverage.
 */
import { getCountyParks } from "@/lib/integrations/fcGis";

// Frederick County bbox [south, west, north, east].
const BBOX: [number, number, number, number] = [39.265, -77.7, 39.745, -77.15];

export type ParkLocation = {
  id: string;
  name: string;
  /** Exact-match key (uppercase alphanumeric). */
  norm: string;
  address?: string;
  type?: string;
  /** Official county (or external) detail page, when a real http url. */
  detailsUrl?: string;
  lng: number;
  lat: number;
};

type ArcFeature = {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

function str(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
}
function httpUrl(v: unknown): string | undefined {
  const s = str(v);
  return s && /^https?:\/\//i.test(s) ? s : undefined;
}
function idOf(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return str(v);
}
function pointOf(coords: unknown): [number, number] | null {
  if (
    Array.isArray(coords) &&
    typeof coords[0] === "number" &&
    typeof coords[1] === "number"
  ) {
    return [coords[0], coords[1]];
  }
  return null;
}

/** Exact-match key: uppercase, keep only A-Z0-9. Pure + exported so
 *  the join logic is unit-tested. */
export function normParkName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}
/** Symmetric trailing-"PARK" strip (only when >=4 chars remain) so
 *  "Baker Park" can still match a location simply named "Baker". */
function strip(norm: string): string {
  if (norm.endsWith("PARK") && norm.length - 4 >= 4) return norm.slice(0, -4);
  return norm;
}

/**
 * Pure: ArcGIS GeoJSON FeatureCollection → ParkLocation[]. Drops
 * nameless, geometry-less, and out-of-county features; dedupes by
 * OBJECTID. Exported for unit tests without the live endpoint.
 */
export function normalizeParkLocations(raw: unknown): ParkLocation[] {
  const feats = (raw as { features?: ArcFeature[] })?.features;
  if (!Array.isArray(feats)) return [];
  const [s, w, n, e] = BBOX;
  const seen = new Set<string>();
  const out: ParkLocation[] = [];
  for (const f of feats) {
    const p = f?.properties ?? {};
    const name = str(p.PARK_NAME);
    if (!name) continue;
    if (f?.geometry?.type !== "Point") continue;
    const pt = pointOf(f.geometry.coordinates);
    if (!pt) continue;
    const [lng, lat] = pt;
    if (lat < s || lat > n || lng < w || lng > e) continue;
    const oid = idOf(p.OBJECTID);
    const key = oid ?? `${name}|${lng.toFixed(5)},${lat.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `fcl-${key}`,
      name,
      norm: normParkName(name),
      address: str(p.ADDRESS),
      type: str(p.TYPE),
      detailsUrl: httpUrl(p.AMENITIES),
      lng,
      lat,
    });
  }
  return out;
}

export async function getFrederickParkLocations(): Promise<ParkLocation[]> {
  const parks = await getCountyParks();
  return parks.map((park, index) => ({
    id: `fc-md-park-${index + 1}`,
    name: park.name,
    norm: normParkName(park.name),
    address: park.address,
    lng: park.lng,
    lat: park.lat,
  }));
}

/**
 * Pure, conservative join: for each park, attach address / detailsUrl /
 * a cleaner type ONLY when its name matches a Park_Locations entry
 * EXACTLY after normalization (full key first, then a symmetric
 * trailing-"PARK" strip). Never overwrites an existing value with
 * empty; parks with no confident match are returned unchanged.
 * Generic over the park shape so it does not couple to fcParks.
 */
export function enrichParksWithLocations<
  T extends { name: string; type?: string; address?: string; detailsUrl?: string },
>(
  parks: T[],
  locations: ParkLocation[],
): Array<T & { type?: string; address?: string; detailsUrl?: string }> {
  if (locations.length === 0) return parks;
  const byNorm = new Map<string, ParkLocation>();
  const byStrip = new Map<string, ParkLocation>();
  for (const loc of locations) {
    if (!byNorm.has(loc.norm)) byNorm.set(loc.norm, loc);
    const st = strip(loc.norm);
    if (st !== loc.norm && !byStrip.has(st)) byStrip.set(st, loc);
  }
  return parks.map((park) => {
    const norm = normParkName(park.name);
    const hit = byNorm.get(norm) ?? byStrip.get(strip(norm));
    if (!hit) return park;
    return {
      ...park,
      address: park.address ?? hit.address,
      detailsUrl: park.detailsUrl ?? hit.detailsUrl,
      // The Park_Locations TYPE reads better than POS_Areas planning
      // types; prefer it when present.
      type: hit.type ?? park.type,
    };
  });
}
