/**
 * Frederick County Parks & Trails — runtime integration.
 *
 * The county runs a public ArcGIS layer of every maintained trail
 * (Parks/Parks_Trails_Cartegraph). The app had NO trail data at all —
 * this is the single biggest "missing data" gap. Fetched server-side
 * at request time with a weekly revalidate (the same pattern as
 * overpass/news — Vercel's server reaches ArcGIS even though local CI
 * can't), normalized to a typed Trail. Graceful []: a feed hiccup
 * never throws into a page, and nothing is fabricated.
 *
 * Field names are the exact ArcGIS attributes confirmed live in PR #23.
 */
import { resolveMunicipality } from "@/lib/connect";

// Only the fields we use + heavily simplified geometry: the raw layer
// with outFields=* and full polylines is ~3.4MB (over Next's 2MB
// fetch-cache limit → would never cache). We only need a representative
// point, so maxAllowableOffset crushes the geometry and the payload
// drops well under the limit, keeping the weekly revalidate cheap.
const OUT_FIELDS = [
  "OBJECTID", "Trail_Name", "Park_Name", "Trail_System", "Trail_Desc",
  "Status", "Surface_Type", "Trail_Length_FT", "ADA_Accessible", "Hiking",
  "Road_Cycling", "Mtn_Biking", "Equestrian", "Dogs_Allowed", "Paved",
  "Owned_By", "Trail_SkillLevel",
].join(",");
const ENDPOINT =
  "https://gis.frederickco.gov/arcgis/rest/services/Parks/Parks_Trails_Cartegraph/FeatureServer/0/query" +
  `?where=1%3D1&outFields=${encodeURIComponent(OUT_FIELDS)}` +
  "&outSR=4326&geometryPrecision=5&maxAllowableOffset=0.002&f=geojson";
// MAP-OVERLAY source. The list ENDPOINT above is the Frederick, COLORADO host
// (every feature drops on the MD bbox → curated fallback). The MAP needs trail
// GEOMETRY, and the correct MD host carries it: ParksAndRecreation/Assets layer
// 12 (Park Trails) = 200 named polyline segments, verified in the MD bbox, ~59KB
// simplified (well under Next's 2MB fetch-cache limit). Its attributes are
// Cartegraph asset fields (ParkName / FunctionalClassification), which are too
// sparse for the rich /trails LIST (that stays curated) but are exactly enough
// to draw the trails on the map — fixing an overlay that was silently empty.
const SHAPES_ENDPOINT =
  "https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Assets/MapServer/12/query" +
  "?where=1%3D1&outFields=ParkName,FunctionalClassification,PavementClassification" +
  "&outSR=4326&geometryPrecision=5&maxAllowableOffset=0.0003&f=geojson";
const TIMEOUT_MS = 15_000;
// Frederick County bbox [south, west, north, east].
const BBOX: [number, number, number, number] = [39.265, -77.7, 39.745, -77.15];

export type Trail = {
  id: string;
  name: string;
  park?: string;
  system?: string;
  description?: string;
  surface?: string;
  paved?: boolean;
  ada?: boolean;
  dogsAllowed?: boolean;
  lengthMi?: number;
  skill?: string;
  uses: string[];
  ownedBy?: string;
  municipality: string;
  /** A representative point (polyline midpoint) for muni + map link. */
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
function yesNo(v: unknown): boolean | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (!s) return undefined;
  if (["yes", "y", "true", "allowed"].includes(s)) return true;
  if (["no", "n", "false", "not allowed"].includes(s)) return false;
  return undefined;
}
function midpoint(coords: unknown): [number, number] | null {
  // LineString = [[lng,lat],...]; MultiLineString = [[[lng,lat],...],...]
  let line: unknown = coords;
  if (Array.isArray(line) && Array.isArray(line[0]) && Array.isArray((line[0] as unknown[])[0])) {
    line = (line as unknown[][])[0];
  }
  if (!Array.isArray(line) || line.length === 0) return null;
  const mid = line[Math.floor(line.length / 2)] as unknown;
  if (!Array.isArray(mid) || mid.length < 2) return null;
  const lng = Number(mid[0]);
  const lat = Number(mid[1]);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

/**
 * Pure: ArcGIS GeoJSON FeatureCollection → Trail[]. Drops nameless,
 * geometry-less, and out-of-county features (never guessed). Exported
 * for unit tests without the live endpoint.
 */
export function normalizeTrails(raw: unknown): Trail[] {
  const feats = (raw as { features?: ArcFeature[] })?.features;
  if (!Array.isArray(feats)) return [];
  const [s, w, n, e] = BBOX;
  const seen = new Set<string>();
  const out: Trail[] = [];
  for (const f of feats) {
    const p = f?.properties ?? {};
    const name = str(p.Trail_Name) ?? str(p.Park_Name);
    if (!name) continue;
    const pt = midpoint(f?.geometry?.coordinates);
    if (!pt) continue;
    const [lng, lat] = pt;
    if (lat < s || lat > n || lng < w || lng > e) continue;
    const key = `${name}|${lng.toFixed(4)},${lat.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const uses: string[] = [];
    if (yesNo(p.Hiking)) uses.push("hiking");
    if (yesNo(p.Road_Cycling)) uses.push("road cycling");
    if (yesNo(p.Mtn_Biking)) uses.push("mountain biking");
    if (yesNo(p.Equestrian)) uses.push("equestrian");
    if (yesNo(p.Dogs_Allowed)) uses.push("dogs");
    const ft = Number(p.Trail_Length_FT);
    out.push({
      id: `fct-${str(p.OBJECTID as string) ?? key}`,
      name,
      park: str(p.Park_Name),
      system: str(p.Trail_System),
      description: str(p.Trail_Desc),
      surface: str(p.Surface_Type),
      paved: yesNo(p.Paved),
      ada: yesNo(p.ADA_Accessible),
      dogsAllowed: yesNo(p.Dogs_Allowed),
      lengthMi:
        Number.isFinite(ft) && ft > 0 ? Math.round((ft / 5280) * 100) / 100 : undefined,
      skill: str(p.Trail_SkillLevel),
      uses,
      ownedBy: str(p.Owned_By),
      municipality: resolveMunicipality({ lng, lat }).municipality.slug,
      lng,
      lat,
    });
  }
  return out;
}

export async function getFrederickTrails(): Promise<Trail[]> {
  // The live ENDPOINT above points at gis.frederickco.gov — turns out
  // that's Frederick, COLORADO. Every feature falls outside the
  // Frederick County, MD bbox and gets dropped, so the live fetch
  // returns []. Keeping the fetch in place so a fix-up to the right
  // MD endpoint flows through unchanged; falling back to the curated
  // list keeps the page useful in the meantime.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let live: Trail[] = [];
  try {
    const res = await fetch(ENDPOINT, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 604800 },
    });
    if (res.ok) live = normalizeTrails(await res.json());
  } catch {
    /* feed hiccup / wrong endpoint — fall through to curated */
  } finally {
    clearTimeout(timer);
  }
  if (live.length > 0) return live;
  const { CURATED_TRAILS } = await import("@/data/curated-trails");
  return CURATED_TRAILS;
}

// ── #3 phase 1: geometry-preserving accessor (foundation for the map
// layer manager). Additive — does not touch getFrederickTrails() or
// any rendering. Returns the simplified trail polylines as a plain
// GeoJSON FeatureCollection with light props; pure + unit-tested.
export type TrailLineFC = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; geometry: unknown; properties: Record<string, unknown> }>;
};

import { slimGeometryFC } from "@/lib/geo/slim-geometry";

export function trailShapesFC(raw: unknown): TrailLineFC {
  const feats = (raw as { features?: ArcFeature[] })?.features;
  const out: TrailLineFC["features"] = [];
  const [s, w, n, e] = BBOX;
  if (Array.isArray(feats)) {
    for (const f of feats) {
      const g = f?.geometry;
      const t = g?.type;
      if (t !== "LineString" && t !== "MultiLineString") continue;
      const p = f?.properties ?? {};
      // Accept the MD Park-Trails (ParkName) shape OR the legacy Cartegraph
      // (Trail_Name/Park_Name) shape, so the overlay works regardless of source
      // and the unit test for either schema stays valid.
      const park = str(p.ParkName) ?? str(p.Park_Name);
      const name = str(p.Trail_Name) ?? park;
      if (!name) continue;
      const pt = midpoint(g?.coordinates);
      if (!pt) continue;
      const [lng, lat] = pt;
      if (lat < s || lat > n || lng < w || lng > e) continue;
      out.push({
        type: "Feature",
        geometry: g,
        properties: {
          name,
          surface: str(p.PavementClassification) ?? str(p.Surface_Type) ?? "",
          park: park ?? "",
        },
      });
    }
  }
  return { type: "FeatureCollection", features: out };
}

export async function getFrederickTrailShapes(): Promise<TrailLineFC> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(SHAPES_ENDPOINT, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 604800 },
    });
    if (!res.ok) return { type: "FeatureCollection", features: [] };
    // Display-slimming (payload audit 2026-07-02): same treatment as the
    // transit shapes — 5-decimal coords, ~9 m tolerance. Trails are drawn,
    // not measured; applied here so the normalizer test stays source-true.
    return slimGeometryFC(trailShapesFC(await res.json()), { decimals: 5, tolerance: 0.00008 });
  } catch {
    return { type: "FeatureCollection", features: [] };
  } finally {
    clearTimeout(timer);
  }
}
