/**
 * USGS real-time water — Frederick County stream & river gauges.
 *
 * The USGS Instantaneous Values service publishes live gage height and
 * streamflow for every active gauge in Frederick County (Monocacy,
 * Catoctin Creek, Potomac, Linganore, …) — keyless, free, public.
 * This is genuine live civic-safety context (rising water), not another
 * directory list. Fetched server-side with a 15-minute revalidate (the
 * gauges report every 15 min), normalized to a typed WaterSite.
 * Graceful []: a feed hiccup never throws into a page.
 *
 * HONEST SCOPING (confirmed live against the service, 2026-05):
 *  - We surface the latest real reading + its timestamp ONLY. We do
 *    NOT compute or show a flood "stage"/"status" (action/minor/…):
 *    those need per-site NWS AHPS thresholds, and inventing a flood
 *    status would be dishonest and unsafe. Flood FORECASTS are NWS's
 *    job; we link out and say so.
 *  - Each site appears once per parameter in the feed, so we group by
 *    USGS site code and merge gage height + streamflow into one site.
 *  - USGS encodes "no reading" as the variable's noDataValue (e.g.
 *    -999999); those are dropped, never shown as a real level.
 */
import { resolveMunicipality } from "@/lib/connect";

const ENDPOINT =
  "https://waterservices.usgs.gov/nwis/iv/?format=json" +
  "&countyCd=24021&parameterCd=00065,00060&siteStatus=active";
const TIMEOUT_MS = 15_000;
// Frederick County bbox [south, west, north, east].
const BBOX: [number, number, number, number] = [39.265, -77.7, 39.745, -77.15];

const PARAM_GAGE_HEIGHT = "00065"; // feet
const PARAM_STREAMFLOW = "00060"; // cubic feet per second

export type WaterSite = {
  /** USGS site code, e.g. "01643000". */
  id: string;
  /** Raw USGS site name, ALL-CAPS (page title-cases for display). */
  name: string;
  /** Short label derived from the name, e.g. "MONOCACY RIVER". */
  river: string;
  /** Latest gage height in feet (00065), if reported. */
  gageHeightFt?: number;
  /** Latest streamflow in ft³/s (00060), if reported. */
  streamflowCfs?: number;
  /** ISO timestamp of the most recent reading used. */
  observedAt?: string;
  municipality: string;
  lng: number;
  lat: number;
};

type IvValue = { value?: unknown; dateTime?: unknown };
type IvTimeSeries = {
  sourceInfo?: {
    siteName?: unknown;
    siteCode?: Array<{ value?: unknown }>;
    geoLocation?: { geogLocation?: { latitude?: unknown; longitude?: unknown } };
  };
  variable?: {
    variableCode?: Array<{ value?: unknown }>;
    noDataValue?: unknown;
  };
  values?: Array<{ value?: IvValue[] }>;
};

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Most recent valid reading in a USGS values block (skips noData). */
function latestReading(
  block: IvValue[] | undefined,
  noData: number,
): { value: number; at: string } | null {
  if (!Array.isArray(block)) return null;
  let best: { value: number; at: string } | null = null;
  for (const v of block) {
    const value = num(v?.value);
    const at = typeof v?.dateTime === "string" ? v.dateTime : "";
    if (value == null || !at) continue;
    if (value === noData || value <= -99999) continue; // USGS "no reading"
    const t = +new Date(at);
    if (!Number.isFinite(t)) continue;
    if (!best || t > +new Date(best.at)) best = { value, at };
  }
  return best;
}

/** "CATOCTIN CREEK NEAR MIDDLETOWN, MD" -> "CATOCTIN CREEK". A pure
 *  substring of the real USGS name — nothing invented. */
function riverOf(name: string): string {
  const cut = name.split(
    /\s+(?:NEAR|AT|ABOVE|BELOW|NR|BL|AB)\s+|,\s*MD\b/i,
  )[0];
  return cut.trim() || name;
}

/**
 * Pure: USGS IV JSON → WaterSite[]. Groups the per-parameter series by
 * site code, keeps the latest real gage-height / streamflow reading,
 * drops out-of-county and reading-less sites (never guessed). Sorted by
 * name. Exported for unit tests without the live endpoint.
 */
export function normalizeWaterSites(raw: unknown): WaterSite[] {
  const series = (raw as { value?: { timeSeries?: IvTimeSeries[] } })?.value
    ?.timeSeries;
  if (!Array.isArray(series)) return [];
  const [s, w, n, e] = BBOX;

  const bySite = new Map<string, WaterSite>();
  for (const ts of series) {
    const si = ts?.sourceInfo;
    const code =
      typeof si?.siteCode?.[0]?.value === "string"
        ? (si.siteCode[0].value as string)
        : undefined;
    const name = typeof si?.siteName === "string" ? si.siteName.trim() : "";
    if (!code || !name) continue;
    const lat = num(si?.geoLocation?.geogLocation?.latitude);
    const lng = num(si?.geoLocation?.geogLocation?.longitude);
    if (lat == null || lng == null) continue;
    if (lat < s || lat > n || lng < w || lng > e) continue;

    const paramCode =
      typeof ts?.variable?.variableCode?.[0]?.value === "string"
        ? (ts.variable.variableCode[0].value as string)
        : "";
    const noData = num(ts?.variable?.noDataValue) ?? -999999;
    const reading = latestReading(ts?.values?.[0]?.value, noData);
    if (!reading) continue;

    let site = bySite.get(code);
    if (!site) {
      site = {
        id: code,
        name,
        river: riverOf(name),
        municipality: resolveMunicipality({ lng, lat }).municipality.slug,
        lng,
        lat,
      };
      bySite.set(code, site);
    }
    if (paramCode === PARAM_GAGE_HEIGHT) site.gageHeightFt = reading.value;
    else if (paramCode === PARAM_STREAMFLOW) site.streamflowCfs = reading.value;
    // Track the freshest timestamp across this site's parameters.
    if (!site.observedAt || +new Date(reading.at) > +new Date(site.observedAt)) {
      site.observedAt = reading.at;
    }
  }

  return [...bySite.values()]
    .filter((x) => x.gageHeightFt != null || x.streamflowCfs != null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFrederickWaterSites(): Promise<WaterSite[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      // Gauges report every ~15 min; match that and keep it cheap.
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    return normalizeWaterSites(await res.json());
  } catch {
    return []; // network/feed hiccup — degrade silently, never fabricate
  } finally {
    clearTimeout(timer);
  }
}
