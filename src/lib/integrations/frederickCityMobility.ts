import type {
  CityMobilityBounds,
  CityMobilityCollection,
  CityMobilityCoverage,
  CityMobilityProperties,
  CityMobilitySourceStatus,
  CityMobilitySourceSummary,
} from "@/lib/map/cityMobility";

const CITY_GIS_BASE =
  "https://spires.cityoffrederick.com/arcgis/rest/services";

export const CITY_MOBILITY_SOURCE_URLS = {
  sidewalks: `${CITY_GIS_BASE}/Sidewalks/MapServer/2`,
  ramps: `${CITY_GIS_BASE}/Sidewalks/MapServer/0`,
  paths: `${CITY_GIS_BASE}/PathPlan/MapServer/0`,
  bikePaths: `${CITY_GIS_BASE}/BikePaths/MapServer`,
} as const;

const PAGE_SIZE = 500;
// Four pages keep one layer below the platform's response-cache ceiling. A
// larger viewport becomes explicitly partial and asks the reader to zoom in.
const MAX_PAGES = 4;
const CURRENT_TTL_MS = 10 * 60_000;
const STALE_TTL_MS = 24 * 60 * 60_000;
const UPSTREAM_TIMEOUT_MS = 8_000;
export const CITY_MOBILITY_CACHE_MAX_ENTRIES = 96;

type MobilityLayerKey = "sidewalks" | "ramps" | "paths";

type ArcGisFeature = {
  id?: string | number;
  type?: string;
  geometry?: GeoJSON.Geometry | null;
  properties?: Record<string, unknown> | null;
};

type ArcGisGeoJson = {
  type?: string;
  features?: ArcGisFeature[];
  exceededTransferLimit?: boolean;
  error?: { code?: number; message?: string; details?: unknown[] };
};

type LayerDefinition = {
  key: MobilityLayerKey;
  sourceId: CityMobilityProperties["source_id"];
  sourceLabel: string;
  url: string;
  outFields: readonly string[];
  geometry: "point" | "line";
};

const LAYERS: readonly LayerDefinition[] = [
  {
    key: "sidewalks",
    sourceId: "cof_sidewalks",
    sourceLabel: "City of Frederick sidewalk inventory",
    url: CITY_MOBILITY_SOURCE_URLS.sidewalks,
    outFields: [
      "OBJECTID",
      "Segment_ID",
      "StreetName",
      "Width_ft",
      "Surface_Ty",
    ],
    geometry: "line",
  },
  {
    key: "ramps",
    sourceId: "cof_sidewalks",
    sourceLabel: "City of Frederick sidewalk ramp inventory",
    url: CITY_MOBILITY_SOURCE_URLS.ramps,
    outFields: [
      "OBJECTID",
      "ID",
      "Ramp_Material",
      "Ramp_Type",
      "Ramp_width",
      "Tactile_Warning_Pad",
      "ADA_Description",
      "Data_Date",
    ],
    geometry: "point",
  },
  {
    key: "paths",
    sourceId: "cof_path_plan",
    sourceLabel: "City of Frederick Path Plan",
    url: CITY_MOBILITY_SOURCE_URLS.paths,
    outFields: [
      "OBJECTID",
      "Id",
      "PATH_NAME",
      "STATUS",
      "PATH_WIDTH",
      "Length",
    ],
    geometry: "line",
  },
] as const;

type LayerResult = {
  status: CityMobilitySourceStatus;
  coverage: CityMobilityCoverage;
  checkedAt?: string;
  reason?: string;
  features: Array<GeoJSON.Feature<GeoJSON.Geometry, CityMobilityProperties>>;
};

type CachedLayer = {
  result: LayerResult;
  currentUntil: number;
  staleUntil: number;
};

const layerCache = new Map<string, CachedLayer>();

export function resetFrederickCityMobilityCacheForTests(): void {
  layerCache.clear();
}

export function frederickCityMobilityCacheSizeForTests(): number {
  return layerCache.size;
}

function cachedLayer(key: string, nowMs: number): CachedLayer | undefined {
  const cached = layerCache.get(key);
  if (!cached) return undefined;
  if (cached.staleUntil <= nowMs) {
    layerCache.delete(key);
    return undefined;
  }
  // Touch on read so the cap behaves as an LRU, not an arbitrary insertion
  // queue. This keeps repeat downtown/mobile views warm while one-off edited
  // bounding boxes leave first.
  layerCache.delete(key);
  layerCache.set(key, cached);
  return cached;
}

function cacheLayer(key: string, value: CachedLayer, nowMs: number): void {
  for (const [candidateKey, candidate] of layerCache) {
    if (candidate.staleUntil <= nowMs) layerCache.delete(candidateKey);
  }
  layerCache.delete(key);
  while (layerCache.size >= CITY_MOBILITY_CACHE_MAX_ENTRIES) {
    const oldest = layerCache.keys().next().value as string | undefined;
    if (!oldest) break;
    layerCache.delete(oldest);
  }
  layerCache.set(key, value);
}

function cleanString(value: unknown, max = 160): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.slice(0, max);
}

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function objectId(properties: Record<string, unknown>): number | null {
  const value = finiteNumber(properties.OBJECTID);
  return value !== undefined && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function pathStatus(value: unknown): CityMobilityProperties["status"] {
  const normalized = cleanString(value, 32)?.toUpperCase();
  if (normalized === "EXISTING") return "EXISTING";
  if (normalized === "PLANNED") return "PLANNED";
  if (normalized === "PROPOSED") return "PROPOSED";
  if (normalized === "DEV") return "DEV";
  return "UNKNOWN";
}

function geometryAllowed(
  geometry: GeoJSON.Geometry | null | undefined,
  kind: LayerDefinition["geometry"],
): geometry is GeoJSON.Geometry {
  if (!geometry) return false;
  if (kind === "point") return geometry.type === "Point";
  return geometry.type === "LineString" || geometry.type === "MultiLineString";
}

function coordinatesAreWgs84(geometry: GeoJSON.Geometry): boolean {
  let sawCoordinate = false;
  let valid = true;
  const visit = (value: unknown) => {
    if (!valid) return;
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      sawCoordinate = true;
      valid =
        Number.isFinite(value[0]) &&
        Number.isFinite(value[1]) &&
        value[0] >= -180 &&
        value[0] <= 180 &&
        value[1] >= -90 &&
        value[1] <= 90;
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  };
  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((item) => {
      if (coordinatesAreWgs84(item)) sawCoordinate = true;
      else valid = false;
    });
  } else {
    visit(geometry.coordinates);
  }
  return sawCoordinate && valid;
}

function normalizeFeature(
  layer: LayerDefinition,
  feature: ArcGisFeature,
): GeoJSON.Feature<GeoJSON.Geometry, CityMobilityProperties> | null {
  const properties = feature.properties ?? {};
  const oid = objectId(properties);
  if (oid === null || !geometryAllowed(feature.geometry, layer.geometry)) return null;
  if (!coordinatesAreWgs84(feature.geometry)) return null;

  if (layer.key === "sidewalks") {
    const street = cleanString(properties.StreetName, 100);
    const width = finiteNumber(properties.Width_ft);
    const surface = cleanString(properties.Surface_Ty, 60);
    return {
      type: "Feature",
      id: `${layer.sourceId}:${oid}`,
      geometry: feature.geometry,
      properties: {
        id: `${layer.sourceId}:${oid}`,
        name: street ? `${street} sidewalk` : "Mapped sidewalk",
        mobility_kind: "sidewalk",
        status: "EXISTING",
        routing_eligible: true,
        routing_role: "network",
        ...(street ? { street_name: street } : {}),
        ...(surface ? { surface_type: surface } : {}),
        ...(width !== undefined && width > 0 ? { width_ft: width } : {}),
        source_id: layer.sourceId,
      },
    };
  }

  if (layer.key === "ramps") {
    const rampType = cleanString(properties.Ramp_Type, 80);
    const material = cleanString(properties.Ramp_Material, 80);
    const width = finiteNumber(properties.Ramp_width);
    const tactile = cleanString(properties.Tactile_Warning_Pad, 80);
    const ada = cleanString(properties.ADA_Description, 140);
    const dataDate = cleanString(properties.Data_Date, 40);
    return {
      type: "Feature",
      id: `${layer.sourceId}:${oid}`,
      geometry: feature.geometry,
      properties: {
        id: `${layer.sourceId}:${oid}`,
        name: rampType ? `${rampType} sidewalk ramp` : "Mapped sidewalk ramp",
        mobility_kind: "ramp",
        status: "EXISTING",
        // A point can explain a crossing, but it is not a traversable edge.
        routing_eligible: false,
        routing_role: "context",
        ...(rampType ? { ramp_type: rampType } : {}),
        ...(material ? { ramp_material: material } : {}),
        ...(width !== undefined && width > 0 ? { width_ft: width } : {}),
        ...(tactile ? { tactile_warning_pad: tactile } : {}),
        ...(ada ? { ada_description: ada } : {}),
        ...(dataDate ? { data_date: dataDate } : {}),
        source_id: layer.sourceId,
      },
    };
  }

  const status = pathStatus(properties.STATUS);
  const name = cleanString(properties.PATH_NAME, 120) ?? "Mapped path";
  const width = finiteNumber(properties.PATH_WIDTH);
  const length = finiteNumber(properties.Length);
  const existing = status === "EXISTING";
  return {
    type: "Feature",
    id: `${layer.sourceId}:${oid}`,
    geometry: feature.geometry,
    properties: {
      id: `${layer.sourceId}:${oid}`,
      name,
      mobility_kind: "path",
      status,
      // This is the hard route contract: DEV, PLANNED, PROPOSED, and UNKNOWN
      // remain visible planning context but can never become a route edge.
      routing_eligible: existing,
      routing_role: existing ? "network" : "context",
      ...(width !== undefined && width > 0 ? { width_ft: width } : {}),
      ...(length !== undefined && length > 0 ? { length_ft: length } : {}),
      source_id: layer.sourceId,
    },
  };
}

function cacheKey(layer: LayerDefinition, bounds: CityMobilityBounds): string {
  return `${layer.key}:${[
    bounds.west,
    bounds.south,
    bounds.east,
    bounds.north,
  ]
    .map((value) => value.toFixed(5))
    .join(",")}`;
}

function queryUrl(
  layer: LayerDefinition,
  bounds: CityMobilityBounds,
  offset: number,
): string {
  const url = new URL(`${layer.url}/query`);
  const params: Record<string, string> = {
    where: "1=1",
    geometry: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: layer.outFields.join(","),
    outSR: "4326",
    returnGeometry: "true",
    geometryPrecision: "6",
    orderByFields: "OBJECTID ASC",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    returnExceededLimitFeatures: "true",
    f: "geojson",
  };
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function fetchPage(
  url: string,
  fetcher: typeof fetch,
): Promise<ArcGisGeoJson> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      cache: "no-store",
      headers: { Accept: "application/geo+json, application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`City GIS returned ${response.status}`);
    const body = (await response.json()) as ArcGisGeoJson;
    if (body.error || body.type !== "FeatureCollection" || !Array.isArray(body.features)) {
      throw new Error(body.error?.message ?? "City GIS returned an invalid response");
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLayer(
  layer: LayerDefinition,
  bounds: CityMobilityBounds,
  nowMs: number,
  fetcher: typeof fetch,
): Promise<LayerResult> {
  const key = cacheKey(layer, bounds);
  const cached = cachedLayer(key, nowMs);
  if (cached && cached.currentUntil > nowMs) return cached.result;

  const checkedAt = new Date(nowMs).toISOString();
  const normalized: LayerResult["features"] = [];
  const seen = new Set<string | number>();
  let coverage: CityMobilityCoverage = "complete";
  let reason: string | undefined;

  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      let response: ArcGisGeoJson;
      try {
        response = await fetchPage(
          queryUrl(layer, bounds, page * PAGE_SIZE),
          fetcher,
        );
      } catch (error) {
        if (page === 0) throw error;
        coverage = "partial";
        reason = "The City service stopped before every result page loaded.";
        break;
      }
      for (const feature of response.features ?? []) {
        const rawFeatureId = feature.properties?.OBJECTID ?? feature.id;
        const featureId =
          typeof rawFeatureId === "string" || typeof rawFeatureId === "number"
            ? rawFeatureId
            : undefined;
        if (featureId !== undefined && seen.has(featureId)) continue;
        if (featureId !== undefined) seen.add(featureId);
        const safe = normalizeFeature(layer, feature);
        if (safe) normalized.push(safe);
      }
      if (!response.exceededTransferLimit) break;
      if (page === MAX_PAGES - 1) {
        coverage = "partial";
        reason = "This view contains more City records than can be shown at once. Zoom in.";
      }
    }
    const result: LayerResult = {
      status: "current",
      coverage,
      checkedAt,
      ...(reason ? { reason } : {}),
      features: normalized,
    };
    cacheLayer(key, {
      result,
      currentUntil: nowMs + CURRENT_TTL_MS,
      staleUntil: nowMs + STALE_TTL_MS,
    }, nowMs);
    return result;
  } catch {
    if (cached && cached.staleUntil > nowMs) {
      return {
        ...cached.result,
        status: "stale",
        coverage: "partial",
        reason:
          "The City service could not be refreshed, so Radius is showing the last successful snapshot.",
      };
    }
    return {
      status: "unavailable",
      coverage: "partial",
      reason: "The City service could not be reached.",
      features: [],
    };
  }
}

function summary(
  result: LayerResult,
  sourceUrl: string,
  label: string,
): CityMobilitySourceSummary {
  return {
    label,
    status: result.status,
    count: result.features.length,
    coverage: result.coverage,
    sourceUrl,
    ...(result.checkedAt ? { checkedAt: result.checkedAt } : {}),
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

export async function getFrederickCityMobility(
  bounds: CityMobilityBounds,
  options: {
    now?: Date;
    fetcher?: typeof fetch;
    /** Ramp points are dense and only render at street zoom. */
    includeRamps?: boolean;
  } = {},
): Promise<CityMobilityCollection> {
  const nowMs = options.now?.getTime() ?? Date.now();
  const fetcher = options.fetcher ?? fetch;
  const includeRamps = options.includeRamps ?? true;
  const requestedLayers = LAYERS.filter(
    (layer) => includeRamps || layer.key !== "ramps",
  );
  const loaded = await Promise.all(
    requestedLayers.map(async (layer) => ({
      key: layer.key,
      result: await fetchLayer(layer, bounds, nowMs, fetcher),
    })),
  );
  const byKey = new Map(loaded.map((entry) => [entry.key, entry.result]));
  const unavailable = (reason: string): LayerResult => ({
    status: "unavailable",
    coverage: "partial",
    reason,
    features: [],
  });
  const sidewalks =
    byKey.get("sidewalks") ?? unavailable("Sidewalk records were not requested.");
  const paths = byKey.get("paths") ?? unavailable("Path records were not requested.");
  const ramps =
    byKey.get("ramps") ??
    unavailable("Sidewalk ramps load when the map reaches street zoom.");
  const results = { sidewalks, ramps, paths };
  const requestedResults = includeRamps
    ? Object.values(results)
    : [sidewalks, paths];
  const available = requestedResults.filter(
    (result) => result.status !== "unavailable",
  );
  const status: CityMobilitySourceStatus = available.some(
    (result) => result.status === "current",
  )
    ? "current"
    : available.some((result) => result.status === "stale")
      ? "stale"
      : "unavailable";
  const coverage: CityMobilityCoverage =
    requestedResults.every(
      (result) => result.status === "current" && result.coverage === "complete",
    )
      ? "complete"
      : "partial";
  const checkedAt = available
    .flatMap((result) => (result.checkedAt ? [result.checkedAt] : []))
    .sort()
    .at(-1);

  return {
    type: "FeatureCollection",
    features: Object.values(results).flatMap((result) => result.features),
    radius: {
      status,
      coverage,
      ...(checkedAt ? { checkedAt } : {}),
      queryBounds: bounds,
      queryDetail: includeRamps ? "street" : "network",
      geography: "City of Frederick",
      routingRule: "Only confirmed EXISTING linework may inform a route.",
      sources: {
        sidewalks: summary(
          sidewalks,
          CITY_MOBILITY_SOURCE_URLS.sidewalks,
          "City of Frederick sidewalk inventory",
        ),
        ramps: summary(
          ramps,
          CITY_MOBILITY_SOURCE_URLS.ramps,
          "City of Frederick sidewalk ramp inventory",
        ),
        paths: summary(
          paths,
          CITY_MOBILITY_SOURCE_URLS.paths,
          "City of Frederick Path Plan",
        ),
        bikePaths: {
          label: "City of Frederick BikePaths service",
          status: "unavailable",
          count: 0,
          coverage: "partial",
          reason:
            "The advertised City BikePaths service currently returns an ArcGIS service error. Radius does not infer bike coverage from it.",
          sourceUrl: CITY_MOBILITY_SOURCE_URLS.bikePaths,
        },
      },
    },
  };
}
