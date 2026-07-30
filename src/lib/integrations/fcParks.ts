/**
 * Frederick County parks.
 *
 * The public list is owner-reviewed Maryland data. An older integration
 * mistakenly queried Frederick County, Colorado before falling back to this
 * list. The runtime request is intentionally gone; the pure normalizer remains
 * only so legacy fixtures and any future, rights-cleared Maryland replacement
 * can be validated without network access.
 */
import { resolveMunicipality } from "@/lib/connect";

// Frederick County bbox [south, west, north, east].
const BBOX: [number, number, number, number] = [39.265, -77.7, 39.745, -77.15];

export type Park = {
  id: string;
  name: string;
  /** Primary classification, e.g. "NEIGHBORHOOD PARK" (raw, ALL-CAPS). */
  type?: string;
  /** Broad category, e.g. "PARK" (raw). */
  category?: string;
  ownership?: string;
  maintainedBy?: string;
  /** Total acres summed across every polygon sharing this name. */
  acres?: number;
  /** Real street address, joined from the official Park_Locations
   *  layer by exact name match (see fcParkLocations). */
  address?: string;
  /** Official county (or external) detail-page link, same join. */
  detailsUrl?: string;
  municipality: string;
  /** Representative point (largest polygon's ring centroid) for the
   *  map-focus deep link + municipality resolve. */
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

const JUNK_NAME = new Set(["N/A", "NA", "NONE", "NULL", "UNKNOWN", "TBD"]);

/**
 * Representative point for a polygon: descend to the first linear ring
 * (handles Polygon `[ring][pt]` and MultiPolygon `[poly][ring][pt]`)
 * and average its vertices. Good enough for a map-focus link and
 * municipality lookup; never throws on odd nesting.
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

/**
 * Pure: ArcGIS GeoJSON FeatureCollection → Park[]. Drops nameless,
 * junk-named ("N/A"), geometry-less, and out-of-county features (never
 * guessed). Collapses polygons that share a Park_name into ONE park —
 * acreage summed, representative point + attributes taken from the
 * largest contributing polygon. Sorted largest-first. Exported for
 * unit tests without the live endpoint.
 */
export function normalizeParks(raw: unknown): Park[] {
  const feats = (raw as { features?: ArcFeature[] })?.features;
  if (!Array.isArray(feats)) return [];
  const [s, w, n, e] = BBOX;

  type Agg = {
    name: string;
    bestAcres: number; // largest single contributing polygon
    totalAcres: number;
    type?: string;
    category?: string;
    ownership?: string;
    maintainedBy?: string;
    municipality: string;
    lng: number;
    lat: number;
    objectId?: string;
  };
  const byName = new Map<string, Agg>();

  for (const f of feats) {
    const p = f?.properties ?? {};
    const name = str(p.Park_name);
    if (!name || JUNK_NAME.has(name.toUpperCase())) continue;
    const pt = polyPoint(f?.geometry?.coordinates);
    if (!pt) continue;
    const [lng, lat] = pt;
    if (lat < s || lat > n || lng < w || lng > e) continue;

    const acresRaw = Number(p.Acreage);
    const acres = Number.isFinite(acresRaw) && acresRaw > 0 ? acresRaw : 0;
    const key = name.toUpperCase().replace(/\s+/g, " ");
    const prev = byName.get(key);

    if (!prev) {
      byName.set(key, {
        name,
        bestAcres: acres,
        totalAcres: acres,
        type: str(p.Type),
        category: str(p.TYPE_2),
        ownership: str(p.Ownership),
        maintainedBy: str(p.Maintained) ?? str(p.OWNER_MAINT_TOWN),
        municipality: resolveMunicipality({ lng, lat }).municipality.slug,
        lng,
        lat,
        objectId: str(p.OBJECTID as string),
      });
      continue;
    }
    prev.totalAcres += acres;
    // Largest polygon wins the point + descriptive attributes.
    if (acres > prev.bestAcres) {
      prev.bestAcres = acres;
      prev.lng = lng;
      prev.lat = lat;
      prev.municipality = resolveMunicipality({ lng, lat }).municipality.slug;
      prev.type = str(p.Type) ?? prev.type;
      prev.category = str(p.TYPE_2) ?? prev.category;
      prev.ownership = str(p.Ownership) ?? prev.ownership;
      prev.maintainedBy =
        str(p.Maintained) ?? str(p.OWNER_MAINT_TOWN) ?? prev.maintainedBy;
    }
  }

  return [...byName.values()]
    .map((a) => ({
      id: `fcp-${a.objectId ?? a.name.toUpperCase().replace(/\s+/g, "-")}`,
      name: a.name,
      type: a.type,
      category: a.category,
      ownership: a.ownership,
      maintainedBy: a.maintainedBy,
      acres:
        a.totalAcres > 0 ? Math.round(a.totalAcres * 10) / 10 : undefined,
      municipality: a.municipality,
      lng: a.lng,
      lat: a.lat,
    }))
    .sort((x, y) => (y.acres ?? 0) - (x.acres ?? 0));
}

export async function getFrederickParks(): Promise<Park[]> {
  const { CURATED_PARKS } = await import("@/data/curated-parks");
  return CURATED_PARKS;
}
