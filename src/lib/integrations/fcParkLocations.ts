/**
 * Frederick County official park LOCATIONS — runtime enrichment for
 * the /parks page.
 *
 * The county runs a second, cleaner ArcGIS layer (Park_Locations) of
 * the official park POINTS: real street ADDRESS, a tidy TYPE
 * ("Mini Park", "Natural Area", "Golf Course", …), and an official
 * county detail-page URL. The shipped /parks page is built on the
 * POS_Areas polygons (acreage, planning types) — this layer does NOT
 * replace it; it ENRICHES it: where a park name matches exactly, the
 * card gains a real address + the official county link.
 *
 * HONEST SOURCING (confirmed live against the layer, 2026-05):
 *  - Native SR is WKID 2876 (MD State Plane, ftUS); outSR=4326 makes
 *    ArcGIS reproject to WGS84 lon/lat (same as the trails/parks/art
 *    layers that already ship correctly).
 *  - The column literally named AMENITIES is NOT an amenity list — it
 *    holds the official detail-page URL (e.g.
 *    frederickco.gov/Facilities/Facility/Details/…), sometimes an
 *    external site, sometimes blank. We expose it as `detailsUrl`
 *    only when it is a real http(s) link.
 *  - Matching is EXACT normalized-name only (uppercase, alphanumeric,
 *    optional symmetric trailing-"PARK" strip) — never fuzzy
 *    containment. A wrong join would put the wrong address on a park,
 *    which is worse than no address; conservatism is the point.
 */

const OUT_FIELDS = ["OBJECTID", "PARK_NAME", "ADDRESS", "TYPE", "AMENITIES"].join(",");
const ENDPOINT =
  "https://gis.frederickco.gov/arcgis/rest/services/Park_Locations/MapServer/0/query" +
  `?where=1%3D1&outFields=${encodeURIComponent(OUT_FIELDS)}` +
  "&outSR=4326&geometryPrecision=5&resultRecordCount=2000&f=geojson";
const TIMEOUT_MS = 15_000;
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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 604800 }, // parks change rarely
    });
    if (!res.ok) return [];
    return normalizeParkLocations(await res.json());
  } catch {
    return []; // feed hiccup / network — degrade silently, never fabricate
  } finally {
    clearTimeout(timer);
  }
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
