/**
 * Frederick County Parks & Open Space — runtime integration.
 *
 * The county runs a public ArcGIS layer of every park and open-space
 * area (Parks/POS_Areas_Cartegraph, layer 1). The app surfaced trails
 * but never the parks themselves — this fills that gap. Fetched
 * server-side at request time with a weekly revalidate (same pattern as
 * fcTrails/transitFrederick — Vercel's server reaches ArcGIS even though
 * local CI can't), normalized to a typed Park. Graceful []: a feed
 * hiccup never throws into a page, and nothing is fabricated.
 *
 * HONEST SOURCING NOTES (confirmed live against the layer, 2026-05):
 *  - Native SR is WKID 2876 (MD State Plane, ftUS); outSR=4326 makes
 *    ArcGIS reproject to WGS84 lon/lat for us.
 *  - Only ~81 of the polygons carry a real Park_name — the rest are
 *    "N/A" landscape-easement parcels (noise). We require a real name
 *    server-side AND in code; we never fall back to the parcel SUBNAME.
 *  - The AMENITIES column holds a planning classification
 *    ("WITHOUT ADEQUATE AMENITIES"), not a user-facing amenity list, so
 *    it is deliberately NOT surfaced — showing it would mislead.
 *  - Big parks span several polygons sharing one Park_name; we collapse
 *    to one card per park, summing acreage and taking the representative
 *    point from the largest polygon.
 */
import { resolveMunicipality } from "@/lib/connect";

// Real ArcGIS attributes confirmed live. Server-side WHERE drops the
// unnamed "N/A" parcels so the payload is tiny; we still re-filter in
// code (the feed has "N/A", "NONE", blanks). Geometry is heavily
// simplified — we only ever derive a representative point from it.
const OUT_FIELDS = [
  "OBJECTID", "Park_name", "Type", "TYPE_2",
  "Ownership", "Maintained", "OWNER_MAINT_TOWN", "Acreage",
].join(",");
const WHERE = "Park_name<>'N/A' AND Park_name IS NOT NULL";
const ENDPOINT =
  "https://gis.frederickco.gov/arcgis/rest/services/Parks/POS_Areas_Cartegraph/MapServer/1/query" +
  `?where=${encodeURIComponent(WHERE)}&outFields=${encodeURIComponent(OUT_FIELDS)}` +
  "&outSR=4326&geometryPrecision=5&maxAllowableOffset=0.002&f=geojson";
const TIMEOUT_MS = 15_000;
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
  // The live ENDPOINT points at gis.frederickco.gov — Frederick, COLORADO, not
  // MD — so every feature drops on the MD bbox and we fall back to curated.
  // DO NOT "fix" this by repointing to the MD host: its Parks layer
  // (fcgis.frederickcountymd.gov ParksAndRecreation/Assets/MapServer/7) is a
  // Cartegraph maintenance-asset dataset (ConditionGroup / EstimatedOCI /
  // CartegraphID, no public name field), narrower + worse than the curated list
  // (verified 2026-06-20). Curated stays canonical for the LIST. (The /map trail
  // OVERLAY does use the MD host — see fcTrails SHAPES_ENDPOINT — because there
  // geometry is what matters, not rich attributes.)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let live: Park[] = [];
  try {
    const res = await fetch(ENDPOINT, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 604800 },
    });
    if (res.ok) live = normalizeParks(await res.json());
  } catch {
    /* feed hiccup / wrong endpoint — fall through to curated */
  } finally {
    clearTimeout(timer);
  }
  if (live.length > 0) return live;
  const { CURATED_PARKS } = await import("@/data/curated-parks");
  return CURATED_PARKS;
}
