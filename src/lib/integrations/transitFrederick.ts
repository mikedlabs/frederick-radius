/**
 * TransIT Frederick — public transit routes.
 *
 * HONEST SOURCING: TransIT's cataloged static GTFS ZIP
 * (maps.frederickcountymd.gov/google/google_transit.zip) currently
 * 404s per Transitland, and no public GTFS-Realtime URL is exposed —
 * so stops/schedules/live-vehicles need the live GTFS feed confirmed
 * with the county (a later phase, NOT faked here). What IS reliable +
 * keyless today is Maryland Open Data's "Frederick County TransIT
 * Routes" (Socrata, 36 routes WITH line geometry) — that is this
 * phase: real route names, destinations, and shapes.
 *
 * Runtime integration, the overpass/trails pattern: server fetch,
 * weekly revalidate, graceful [] on any failure, no key, nothing
 * fabricated.
 */
const ENDPOINT = "https://opendata.maryland.gov/resource/2xca-jw6k.geojson?$limit=500";
const TIMEOUT_MS = 15_000;
// Frederick County bbox [south, west, north, east].
const BBOX: [number, number, number, number] = [39.265, -77.7, 39.745, -77.15];

export type TransitRoute = {
  id: string;
  name: string;
  destination?: string;
  variation?: string;
  /** Representative point (first vertex) for a map-focus link. */
  lng: number;
  lat: number;
};

type Feature = {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

function pick(p: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

// First vertex of a LineString or MultiLineString (any nesting) —
// enough for a map-focus point. Descends into first elements until a
// [number, number] pair.
function firstVertex(coords: unknown): [number, number] | null {
  let c: unknown = coords;
  for (let depth = 0; depth < 6; depth++) {
    if (
      Array.isArray(c) &&
      typeof c[0] === "number" &&
      typeof c[1] === "number"
    ) {
      return [c[0], c[1]];
    }
    if (Array.isArray(c) && c.length > 0) {
      c = c[0];
      continue;
    }
    return null;
  }
  return null;
}

/**
 * Pure: Socrata GeoJSON FeatureCollection → TransitRoute[]. Drops
 * nameless / geometry-less / out-of-county. Exported for unit tests
 * (no network). Defensive about Socrata's column casing.
 */
export function normalizeTransitRoutes(raw: unknown): TransitRoute[] {
  const feats = (raw as { features?: Feature[] })?.features;
  if (!Array.isArray(feats)) return [];
  const [s, w, n, e] = BBOX;
  const seen = new Set<string>();
  const out: TransitRoute[] = [];
  for (const f of feats) {
    const p = f?.properties ?? {};
    const name = pick(p, "route_name", "Route Name", "routename");
    if (!name) continue;
    const pt = firstVertex(f?.geometry?.coordinates);
    if (!pt) continue;
    const [lng, lat] = pt;
    if (lat < s || lat > n || lng < w || lng > e) continue;
    const id = pick(p, "route_id", "Route ID", "gis_object_id") ?? name;
    const variation = pick(p, "variation", "Variation");
    const key = `${id}|${variation ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: String(id),
      name,
      destination: pick(p, "destination", "Destination"),
      variation,
      lng,
      lat,
    });
  }
  return out;
}

export async function getFrederickTransitRoutes(): Promise<TransitRoute[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 604800 }, // routes change rarely
    });
    if (!res.ok) return [];
    return normalizeTransitRoutes(await res.json());
  } catch {
    return []; // network/feed hiccup — degrade silently, never fabricate
  } finally {
    clearTimeout(timer);
  }
}
