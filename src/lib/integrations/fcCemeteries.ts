/**
 * Historic Cemeteries of Frederick County — county GIS heritage layer.
 *
 * The county's open-data hub (gis-fcgmd.opendata.arcgis.com) publishes
 * "Historic Cemeteries of Frederick County, Maryland" as a hosted ArcGIS
 * FeatureServer: 307 named point features (church yards, family plots,
 * burial grounds). Radius reads the official public service at runtime,
 * preserves its approximation status, and credits both Frederick County GIS
 * and the Holdcraft research named by the source.
 *
 * Live-verified 2026-07-07: attributes are Name / PlaceName (the locale,
 * e.g. "Foxville") / LocType ("Located" | "Approximate Location" |
 * "Location Unknown") / RefNo / FieldVerif / Misc. There is NO
 * established-date field; FieldVerif and Misc are effectively empty, so
 * we fetch only the three fields we render (slim payload, ~65KB raw).
 *
 * Rules, matching the sibling county-GIS feeds:
 *  - "Location Unknown" rows are DROPPED — plotting a point the county
 *    itself says it can't place would be dishonest. "Approximate
 *    Location" rows are kept but flagged so the popup can say so.
 *  - Every point is gated through the real county ring
 *    (isInFrederickCountyArea) — the source includes a few reference
 *    points over the county line.
 *  - unstable_cache, SHA-pinned + weekly revalidate (cemeteries change
 *    on a geological clock; the SHA pin is the #509 lesson — a deploy
 *    that changes this cleaning auto-invalidates).
 *  - Fail-soft to [] so a feed hiccup means a missing layer, never a 503.
 */
import { unstable_cache } from "next/cache";
import { isInFrederickCountyArea } from "@/lib/geo";
import { cleanFeedText } from "@/lib/format/text";
import { frederickCountySourceEnabled } from "@/lib/integrations/fcCountySource";

const ENDPOINT =
  "https://services5.arcgis.com/o8KSxSzYaulbGcFX/arcgis/rest/services/HistoricCemeteries/FeatureServer/0/query" +
  "?where=1%3D1&outFields=FID,Name,PlaceName,LocType&outSR=4326&f=geojson";
const TIMEOUT_MS = 15_000;

export type HistoricCemetery = {
  /** Stable id from the source FID. */
  id: string;
  name: string;
  /** The locale the county files it under, e.g. "Foxville". */
  place?: string;
  /** True when the county marks the point "Approximate Location". */
  approximate: boolean;
  lng: number;
  lat: number;
};

type CemFeature = {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown>;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Pure: ArcGIS GeoJSON FeatureCollection → HistoricCemetery[]. Drops
 * nameless, geometry-less, location-unknown, and out-of-county features
 * (never guessed). Sorted by name. Exported for unit tests without the
 * live endpoint.
 */
export function normalizeCemeteries(raw: unknown): HistoricCemetery[] {
  const feats = (raw as { features?: CemFeature[] })?.features;
  if (!Array.isArray(feats)) return [];
  const out: HistoricCemetery[] = [];
  const seen = new Set<string>();
  for (const f of feats) {
    if (f?.geometry?.type !== "Point") continue;
    const c = f.geometry.coordinates;
    if (!Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number") continue;
    const [lng, lat] = c as [number, number];
    if (!isInFrederickCountyArea(lng, lat)) continue;
    const p = f.properties ?? {};
    const locType = str(p.LocType).toLowerCase();
    // The county says it can't place these — don't pretend otherwise.
    if (locType === "location unknown") continue;
    const name = cleanFeedText(str(p.Name));
    if (!name) continue;
    const id = String(p.FID ?? `${lng},${lat}`);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      place: cleanFeedText(str(p.PlaceName)) || undefined,
      approximate: locType === "approximate location",
      lng,
      lat,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchCemeteries(): Promise<HistoricCemetery[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      // The unstable_cache wrapper below is the cache; don't double-cache
      // the raw body in the fetch data cache too.
      cache: "no-store",
    });
    if (!res.ok) return [];
    return normalizeCemeteries(await res.json());
  } catch {
    return []; // network/feed hiccup — degrade to a missing layer, never fabricate
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The county's historic cemeteries, normalized. Weekly revalidate,
 * SHA-pinned key (a deploy that changes the cleaning auto-invalidates —
 * the #509 lesson). Empty array on any failure.
 */
const getHistoricCemeteriesCached = unstable_cache(
  fetchCemeteries,
  ["fc-cemeteries-v1", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 604_800 },
);

export async function getHistoricCemeteries(): Promise<HistoricCemetery[]> {
  if (!frederickCountySourceEnabled("fc_historic_cemeteries")) return [];
  return getHistoricCemeteriesCached();
}
