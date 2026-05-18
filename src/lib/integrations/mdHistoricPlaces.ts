/**
 * Maryland National Register of Historic Places — Frederick County.
 *
 * Maryland publishes the full National Register as a keyless Socrata
 * GeoJSON dataset (yf2f-by4g) maintained by the Maryland Historical
 * Trust. Frederick County is exceptionally rich here (Civil War,
 * historic districts, Mason-Dixon markers). This is a heritage
 * DISCOVERY layer — a sibling to the public art tour, the opposite of
 * a directory. Fetched server-side with a weekly revalidate (the
 * register changes very rarely), graceful [] on any failure.
 *
 * HONEST SOURCING (confirmed live against the dataset, 2026-05):
 *  - The dataset is statewide and has NO county/city column — location
 *    lives only in the property polygon. We filter server-side with
 *    Socrata within_box() to the Frederick County envelope (149 rows),
 *    then re-check a representative point against the county bbox in
 *    code. Nothing is guessed.
 *  - Geometry is (Multi)Polygon; we derive ONE representative point
 *    (outer-ring centroid) for the map-focus link + municipality.
 *  - `nrurl` is the official Maryland Historical Trust detail page;
 *    kept only when it is a real http(s) link (some rows are null).
 */
import { resolveMunicipality } from "@/lib/connect";

// Frederick County bbox [south, west, north, east].
const BBOX: [number, number, number, number] = [39.265, -77.7, 39.745, -77.15];
// Socrata within_box(geo, NWlat, NWlon, SElat, SElon). Verified to
// return 149 Frederick-area features.
const ENDPOINT =
  "https://opendata.maryland.gov/resource/yf2f-by4g.geojson" +
  "?$select=nrname,altname,category,listeddate,nhl,nrurl,natregid,the_geom" +
  "&$where=within_box(the_geom,39.745,-77.7,39.265,-77.15)&$limit=1000";
const TIMEOUT_MS = 15_000;

export type HistoricPlace = {
  id: string;
  name: string;
  /** Alternate/historic name, only when it differs from `name`. */
  altName?: string;
  /** Building, Site, District, Structure, Object. */
  category?: string;
  /** 4-digit year listed on the National Register. */
  listedYear?: string;
  /** National Historic Landmark (a higher distinction than NR). */
  isNHL?: boolean;
  /** Official Maryland Historical Trust detail page. */
  url?: string;
  municipality: string;
  lng: number;
  lat: number;
};

type Feature = {
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

/**
 * Representative point for a polygon: descend to the first linear ring
 * (handles Polygon `[ring][pt]` and MultiPolygon `[poly][ring][pt]`)
 * and average its vertices. Never throws on odd nesting.
 */
function polyPoint(coords: unknown): [number, number] | null {
  let ring: unknown = coords;
  for (let depth = 0; depth < 6; depth++) {
    if (
      Array.isArray(ring) &&
      Array.isArray(ring[0]) &&
      typeof (ring[0] as unknown[])[0] === "number" &&
      typeof (ring[0] as unknown[])[1] === "number"
    ) {
      break; // `ring` is now an array of [lng,lat] pairs
    }
    if (Array.isArray(ring) && ring.length > 0) {
      ring = ring[0];
      continue;
    }
    return null;
  }
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let sx = 0, sy = 0, k = 0;
  for (const v of ring as unknown[]) {
    if (Array.isArray(v) && typeof v[0] === "number" && typeof v[1] === "number") {
      sx += v[0];
      sy += v[1];
      k++;
    }
  }
  if (k === 0) return null;
  const lng = sx / k;
  const lat = sy / k;
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function yearOf(v: unknown): string | undefined {
  const s = str(v);
  const m = s?.match(/\b(1[6-9]\d{2}|20\d{2})\b/);
  return m ? m[1] : undefined;
}

/**
 * Pure: Socrata GeoJSON FeatureCollection → HistoricPlace[]. Drops
 * nameless, geometry-less, and out-of-county features (never guessed),
 * dedupes by National Register id. Exported for unit tests without the
 * live endpoint.
 */
export function normalizeHistoricPlaces(raw: unknown): HistoricPlace[] {
  const feats = (raw as { features?: Feature[] })?.features;
  if (!Array.isArray(feats)) return [];
  const [s, w, n, e] = BBOX;
  const seen = new Set<string>();
  const out: HistoricPlace[] = [];

  for (const f of feats) {
    const p = f?.properties ?? {};
    const name = str(p.nrname);
    if (!name) continue;
    const pt = polyPoint(f?.geometry?.coordinates);
    if (!pt) continue;
    const [lng, lat] = pt;
    if (lat < s || lat > n || lng < w || lng > e) continue;
    const regId = str(p.natregid);
    const key = regId ?? `${name}|${lng.toFixed(5)},${lat.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const alt = str(p.altname);
    out.push({
      id: `mdnr-${key}`,
      name,
      altName: alt && alt.toLowerCase() !== name.toLowerCase() ? alt : undefined,
      category: str(p.category),
      listedYear: yearOf(p.listeddate),
      isNHL: str(p.nhl) === "1",
      url: httpUrl(p.nrurl),
      municipality: resolveMunicipality({ lng, lat }).municipality.slug,
      lng,
      lat,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFrederickHistoricPlaces(): Promise<HistoricPlace[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      // The National Register changes very rarely; weekly is plenty.
      next: { revalidate: 604800 },
    });
    if (!res.ok) return [];
    return normalizeHistoricPlaces(await res.json());
  } catch {
    return []; // network/feed hiccup — degrade silently, never fabricate
  } finally {
    clearTimeout(timer);
  }
}
