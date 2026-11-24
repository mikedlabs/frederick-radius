/** USGS Water Data OGC API. Recent height and discharge observations may
 * be provisional. Flood thresholds come only from NWS. */
import { resolveMunicipality } from "@/lib/connect";
import { FLOOD_STAGES, type FloodStages } from "@/lib/integrations/floodStage";

const COLLECTIONS = "https://api.waterdata.usgs.gov/ogcapi/v1/collections";
const CACHE_SECONDS = 900;
const HOUR = 60 * 60 * 1000;
const MAX_READING_AGE = 2 * HOUR;
const PERIODS = { PT6H: 6 * HOUR, P1D: 24 * HOUR, P7D: 168 * HOUR };
type Period = keyof typeof PERIODS;

/** Link directly to the agency's readable measurements for this station. */
export function usgsGaugeReadingsUrl(siteId: string): string {
  const url = new URL("https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items");
  url.search = new URLSearchParams({ f: "html", monitoring_location_id: `USGS-${siteId}`, parameter_code: "00065,00060" }).toString();
  return url.toString();
}

export type Reading = { value: number; at: string };

export type WaterSite = {
  /** USGS site code, e.g. "01643000". */
  id: string;
  /** Name published for the USGS monitoring location. */
  name: string;
  /** Short label derived from the name, e.g. "MONOCACY RIVER". */
  river: string;
  /** Latest gage height in feet (00065), if reported. */
  gageHeightFt?: number;
  /** Latest streamflow in ft³/s (00060), if reported. */
  streamflowCfs?: number;
  /** ISO timestamp of the most recent reading used. */
  observedAt?: string;
  /** Time-series history of gage height readings (newest last), when
   *  fetched via getFrederickWaterSitesWithHistory(). Each gauge
   *  reports every ~15 min, so 6h has ~24 and 24h has ~96 readings. */
  gageHistory?: Reading[];
  streamflowHistory?: Reading[];
  /** NWS flood thresholds, present only for NWS forecast-point gauges. */
  floodStages?: FloodStages;
  municipality: string;
  lng: number;
  lat: number;
};

export type WaterSitesResult = {
  data: WaterSite[];
  /** True only when USGS answered successfully. An empty successful payload
   * remains distinct from a timeout, network failure, or non-2xx response. */
  available: boolean;
};

type Feature = {
  id?: unknown;
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown[] } | null;
};

function collectionUrl(collection: string, params: Record<string, string>): URL {
  const url = new URL(`${COLLECTIONS}/${collection}/items`);
  url.search = new URLSearchParams({
    f: "json",
    state_code: "24",
    county_code: "021",
    agency_code: "USGS",
    ...params,
  }).toString();
  return url;
}

/** Keep each response below the Next fetch cache's per-entry size limit.
 * Only the cursor supplied by USGS can change between pages. */
async function readCollection(url: URL, revalidate: number, signal: AbortSignal): Promise<Feature[]> {
  const features: Feature[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < 25; page++) {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/geo+json" },
      next: { revalidate },
      signal,
    });
    if (!res.ok) throw new Error(`USGS returned ${res.status}`);
    const body = await res.json();
    if (body?.type !== "FeatureCollection" || !Array.isArray(body.features) || !Array.isArray(body.links)) {
      throw new Error("USGS returned an invalid feature collection");
    }
    features.push(...body.features);
    const next = body.links.find((link: { rel?: string } | null) => link?.rel === "next");
    if (!next) return features;
    const nextUrl = new URL(next.href, url);
    const cursor = nextUrl.searchParams.get("cursor");
    if (nextUrl.origin !== url.origin || nextUrl.pathname !== url.pathname || !cursor || seen.has(cursor)) {
      throw new Error("Invalid USGS page cursor");
    }
    seen.add(cursor);
    url.searchParams.set("cursor", cursor);
  }
  throw new Error("Incomplete USGS collection");
}

function riverOf(name: string): string {
  return name.split(/\s+(?:NEAR|AT|ABOVE|BELOW|NR|BL|AB)\s+|,\s*MD\b/i)[0].trim() || name;
}

type Series = { height: Map<number, number>; flow: Map<number, number> };

function groupReadings(observations: Feature[], since: number, now: number): Map<string, Series> {
  const sites = new Map<string, Series>();
  for (const feature of observations) {
    const p = feature?.properties;
    if (!p || p.statistic_id !== "00011" || typeof p.monitoring_location_id !== "string") continue;
    const code = /^USGS-(\d{8,15})$/.exec(p.monitoring_location_id)?.[1];
    const height = p.parameter_code === "00065" && p.unit_of_measure === "ft";
    const flow = p.parameter_code === "00060" && p.unit_of_measure === "ft^3/s";
    if (!code || (!height && !flow) || typeof p.time !== "string") continue;
    const at = Date.parse(p.time);
    const value = typeof p.value === "string" && p.value.trim() ? Number(p.value) : p.value;
    if (!Number.isFinite(at) || at < since || at > now) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= -99999) continue;
    const series = sites.get(code) ?? {
      height: new Map<number, number>(),
      flow: new Map<number, number>(),
    };
    (height ? series.height : series.flow).set(at, value);
    sites.set(code, series);
  }
  return sites;
}

/** Only publish a parameter whose own latest observation is current. The
 * series still contains every valid measurement in the requested window. */
function currentSeries(series: Map<number, number>, now: number): Reading[] {
  const sorted = [...series].sort(([a], [b]) => a - b);
  const last = sorted.at(-1);
  if (!last || last[0] < now - MAX_READING_AGE) return [];
  return sorted.map(([at, value]) => ({ at: new Date(at).toISOString(), value }));
}

function joinStations(
  stations: Feature[],
  readings: Map<string, Series>,
  now: number,
  history: boolean,
): WaterSite[] {
  const sites: WaterSite[] = [];
  for (const station of stations) {
    const p = station?.properties;
    const code = typeof station?.id === "string" ? /^USGS-(\d{8,15})$/.exec(station.id)?.[1] : undefined;
    const series = code ? readings.get(code) : undefined;
    const coordinates = station?.geometry?.coordinates;
    const name = typeof p?.monitoring_location_name === "string" ? p.monitoring_location_name.trim() : "";
    if (!code || !series || !name || p?.state_code !== "24" || p.county_code !== "021" ||
      station.geometry?.type !== "Point" || !Array.isArray(coordinates)) continue;
    const [lng, lat] = coordinates;
    if (typeof lng !== "number" || !Number.isFinite(lng) || Math.abs(lng) > 180 ||
        typeof lat !== "number" || !Number.isFinite(lat) || Math.abs(lat) > 90) continue;

    const height = currentSeries(series.height, now);
    const flow = currentSeries(series.flow, now);
    const latestHeight = height.at(-1);
    const latestFlow = flow.at(-1);
    if (!latestHeight && !latestFlow) continue;
    const site: WaterSite = {
      id: code, name, river: riverOf(name), lng, lat,
      municipality: resolveMunicipality({ lng, lat }).municipality.slug,
    };
    if (latestHeight) {
      site.gageHeightFt = latestHeight.value;
      site.floodStages = FLOOD_STAGES[code];
      site.observedAt = latestHeight.at;
      if (history) site.gageHistory = height;
    }
    if (latestFlow) {
      site.streamflowCfs = latestFlow.value;
      if (!site.observedAt || latestFlow.at > site.observedAt) site.observedAt = latestFlow.at;
      if (history) site.streamflowHistory = flow;
    }
    sites.push(site);
  }
  return sites.sort((a, b) => a.name.localeCompare(b.name));
}

async function readWaterSites(period?: Period): Promise<WaterSitesResult> {
  const now = Date.now();
  const duration = period ? PERIODS[period] : MAX_READING_AGE;
  const bucket = Math.floor(now / (CACHE_SECONDS * 1000)) * CACHE_SECONDS * 1000;
  // A shared 15-minute URL makes server-side caching effective across visitors.
  // Filter the extra minutes at each end against the exact window after fetching.
  const datetime = `${new Date(bucket - duration).toISOString()}/${new Date(bucket + CACHE_SECONDS * 1000).toISOString()}`;
  const url = collectionUrl(period ? "continuous" : "latest-continuous", {
    parameter_code: "00065,00060",
    statistic_id: "00011",
    properties: "monitoring_location_id,parameter_code,statistic_id,unit_of_measure,time,value",
    skipGeometry: "true",
    datetime,
    limit: "4000",
  });
  const signal = AbortSignal.timeout(15_000);
  try {
    const rows = await readCollection(url, CACHE_SECONDS, signal);
    const readings = groupReadings(rows, now - duration, now);
    const ids = [...readings.keys()].sort();
    if (!ids.length) return { available: true, data: [] };
    // Observation features omit names. Join real station metadata for the
    // reporting gauges, cached for a day and bounded to Maryland county 021.
    const stations = await readCollection(collectionUrl("monitoring-locations", {
      monitoring_location_number: ids.join(","),
      properties: "monitoring_location_name,state_code,county_code",
      limit: "1000",
    }), 86400, signal);
    return { data: joinStations(stations, readings, now, Boolean(period)), available: true };
  } catch {
    return { data: [], available: false };
  }
}

export async function getFrederickWaterSites(): Promise<WaterSite[]> {
  return (await readWaterSites()).data;
}

export async function getFrederickWaterSitesWithHistory(period: Period = "P1D"): Promise<WaterSite[]> {
  return (await getFrederickWaterSitesWithHistoryResult(period)).data;
}

/** Preserve the distinction between a valid empty observation window and a
 * failed or incomplete provider request for the Pulse coverage indicator. */
export function getFrederickWaterSitesWithHistoryResult(period: Period = "P1D"): Promise<WaterSitesResult> {
  return readWaterSites(period);
}

/**
 * Trend direction over the last 4 readings vs the previous 4 — a cheap
 * "rising / falling / steady" indicator without a statistical model. Returns
 * null when there's not enough history. Shared by /rivers and the /pulse rivers
 * tile so the two surfaces label the same gauge the same way.
 */
export function readingTrend(
  history?: Reading[],
): "rising" | "falling" | "steady" | null {
  if (!history || history.length < 8) return null;
  const recent = history.slice(-4).reduce((a, b) => a + b.value, 0) / 4;
  const prior = history.slice(-8, -4).reduce((a, b) => a + b.value, 0) / 4;
  const delta = recent - prior;
  // Threshold = 1% of recent value, or 0.05 if recent is tiny.
  const tol = Math.max(Math.abs(recent) * 0.01, 0.05);
  if (delta > tol) return "rising";
  if (delta < -tol) return "falling";
  return "steady";
}
