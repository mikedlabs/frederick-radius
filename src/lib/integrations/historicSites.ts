/**
 * Historic field guide — first-party local-history layers that don't exist
 * anywhere else in the place dataset:
 *   1. MDOT SHA Maryland Roadside Historical Markers (COUNTYID=11) — 28 Frederick
 *      markers, each carrying its FULL inscription text. Pure reading content.
 *   2. NPS National Register of Historic Places (State=MARYLAND, County=Frederick)
 *      — 50 listed sites incl. all the covered bridges, with listing year + NHL.
 *
 * Both are keyless ArcGIS REST services queried via the shared queryArcGIS helper
 * (f=json → geometry.x/y in WGS84). Server-only, weekly ISR; fail-soft to [] so
 * a feed hiccup never breaks the page; every row is bbox-guarded to Frederick MD.
 * Verified live 2026-06-20 (28 markers / 50 register points).
 */
import { queryArcGISOutcome } from "@/lib/integrations/arcgis";
import { resolveMunicipality } from "@/lib/connect";
import { cleanFeedText } from "@/lib/format/text";

// %28/%29 encode the parens in the service path (raw parens 404 on this host).
const MARKERS_URL =
  "https://services.arcgis.com/njFNhDsUCentVYJW/arcgis/rest/services/Marylands_Historical_Markers_%28View%29/FeatureServer/1";
const NRHP_URL =
  "https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/0";

// Markers and the register change maybe yearly, so a long window costs nothing
// in freshness. It cost something else: a build that fetched nothing baked an
// empty page for SEVEN DAYS, and the page told readers to "check back shortly".
// An hour is still effectively free against two keyless services and lets a
// transient failure heal itself the way the copy already promises.
const WEEK = 3600;
// Frederick County bbox [south, west, north, east] (matches fcTrails).
const BBOX: [number, number, number, number] = [39.265, -77.7, 39.745, -77.15];
const inBbox = (lng: number, lat: number) =>
  lat >= BBOX[0] && lat <= BBOX[2] && lng >= BBOX[1] && lng <= BBOX[3];

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
function yearOf(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  // ArcGIS dates are epoch-ms. Guard against a bare year stored as a small int.
  const y = v > 10_000_000_000 ? new Date(v).getUTCFullYear() : v > 1500 && v < 2100 ? v : undefined;
  return y && y >= 1600 && y <= 2100 ? y : undefined;
}
function xy(g: { x?: number; y?: number } | null | undefined): [number, number] | null {
  const lng = g?.x;
  const lat = g?.y;
  return typeof lng === "number" && typeof lat === "number" ? [lng, lat] : null;
}

export type HistoricMarker = {
  id: string;
  title: string;
  town: string;
  municipality: string;
  inscription: string;
  year?: number;
  lng: number;
  lat: number;
};

export type RegisterSite = {
  id: string;
  name: string;
  municipality: string;
  year?: number;
  isNHL: boolean;
  isCoveredBridge: boolean;
  lng: number;
  lat: number;
};

/** The 28 roadside markers with their inscriptions, sorted by town then title. */
export async function getHistoricMarkers(): Promise<HistoricMarker[]> {
  return (await getHistoricMarkersResult()).items;
}

/** The same markers, plus whether MDOT actually answered. */
export async function getHistoricMarkersResult(): Promise<{
  items: HistoricMarker[];
  ok: boolean;
}> {
  const { features: feats, ok } = await queryArcGISOutcome(
    MARKERS_URL,
    { where: "COUNTYID=11", outFields: "OBJECTID,MARKERTITLE,TOWN,MARKERTEXT,INSTALLDATE" },
    WEEK,
  );
  const out: HistoricMarker[] = [];
  for (const f of feats) {
    const pt = xy(f.geometry as { x?: number; y?: number });
    if (!pt || !inBbox(pt[0], pt[1])) continue;
    const a = f.attributes;
    const title = cleanFeedText(str(a.MARKERTITLE));
    if (!title) continue;
    let inscription = cleanFeedText(str(a.MARKERTEXT));
    // The inscription text usually repeats the marker title at the very start.
    if (inscription.startsWith(title)) inscription = inscription.slice(title.length).trim();
    out.push({
      id: String(a.OBJECTID ?? title),
      title,
      town: str(a.TOWN),
      municipality: resolveMunicipality({ lng: pt[0], lat: pt[1] }).municipality.slug,
      inscription,
      year: yearOf(a.INSTALLDATE),
      lng: pt[0],
      lat: pt[1],
    });
  }
  return {
    items: out.sort(
      (a, b) =>
        a.municipality.localeCompare(b.municipality) || a.title.localeCompare(b.title),
    ),
    ok,
  };
}

/** The ~50 National Register sites, covered bridges flagged, newest listing first. */
export async function getRegisterSites(): Promise<RegisterSite[]> {
  return (await getRegisterSitesResult()).items;
}

/** The same register sites, plus whether the Park Service actually answered. */
export async function getRegisterSitesResult(): Promise<{
  items: RegisterSite[];
  ok: boolean;
}> {
  const { features: feats, ok } = await queryArcGISOutcome(
    NRHP_URL,
    { where: "State='MARYLAND' AND County='Frederick'", outFields: "OBJECTID,RESNAME,Is_NHL,CertDate" },
    WEEK,
  );
  const out: RegisterSite[] = [];
  for (const f of feats) {
    const pt = xy(f.geometry as { x?: number; y?: number });
    if (!pt || !inBbox(pt[0], pt[1])) continue;
    const a = f.attributes;
    const name = cleanFeedText(str(a.RESNAME));
    if (!name) continue;
    out.push({
      id: String(a.OBJECTID ?? name),
      name,
      municipality: resolveMunicipality({ lng: pt[0], lat: pt[1] }).municipality.slug,
      year: yearOf(a.CertDate),
      isNHL: /^(y|1|true)/i.test(str(a.Is_NHL) || String(a.Is_NHL ?? "")),
      isCoveredBridge: /covered bridge/i.test(name),
      lng: pt[0],
      lat: pt[1],
    });
  }
  return {
    items: out.sort(
      (a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name),
    ),
    ok,
  };
}
