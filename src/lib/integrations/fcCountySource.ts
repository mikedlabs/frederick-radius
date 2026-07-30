/**
 * Shared boundary for Frederick County's public ArcGIS services.
 *
 * County layers are useful, but a successful HTTP response is not evidence
 * that an asset is usable, a road is safe, or a project is under construction.
 * Domain adapters attach those caveats and expose only allowlisted fields.
 *
 * This helper owns the mechanical guarantees:
 *  - WGS84 GeoJSON only
 *  - stable OBJECTID pagination (no silently truncated layers)
 *  - one bounded timeout for the entire pull
 *  - ArcGIS error-envelope detection
 *  - no partial result when a later page fails
 *  - explicit cache and provenance metadata
 */

export const FREDERICK_COUNTY_SOURCE_IDS = [
  "fc_planning_projects",
  "fc_snow_command",
  "fc_parks_assets",
  "fc_high_water",
  "fc_food_truck_roster",
  "fc_municipal_boundaries",
  "fc_county_parks",
  "fc_park_trails",
  "fc_historic_cemeteries",
  "fc_recreation_locations",
  "fc_county_facilities",
] as const;

export type FrederickCountySourceId =
  (typeof FREDERICK_COUNTY_SOURCE_IDS)[number];

/**
 * Official public GIS layers Radius may read live. These stay on the County's
 * servers, request only allowlisted public fields, and are never exposed as a
 * Radius download or committed mirror.
 */
export const FREDERICK_COUNTY_PUBLIC_RUNTIME_SOURCE_IDS = [
  "fc_planning_projects",
  "fc_snow_command",
  "fc_parks_assets",
  "fc_high_water",
  "fc_municipal_boundaries",
  "fc_county_parks",
  "fc_park_trails",
  "fc_historic_cemeteries",
] as const satisfies readonly FrederickCountySourceId[];

/**
 * Non-GIS documents, attachment-bearing surveys, and the dead legacy ingest
 * remain opt-in. Public reachability alone is not enough to activate those
 * materially different reuse paths.
 */
export const FREDERICK_COUNTY_APPROVAL_GATED_SOURCE_IDS = [
  "fc_food_truck_roster",
  "fc_recreation_locations",
  "fc_county_facilities",
] as const satisfies readonly FrederickCountySourceId[];

/** Backward-compatible type name for the County adapter family. */
export type FrederickCountyApprovableSourceId = FrederickCountySourceId;

export type CountySourceDescriptor = {
  /** Stable runtime provenance id. */
  id: string;
  /** Exact data/sources.yaml row that controls permission and health. */
  ledgerId: FrederickCountySourceId;
  title: string;
  authority: "Frederick County Government" | "Frederick County Health Department";
  sourceUrl: string;
  dataUrl: string;
  supportingDataUrls?: readonly string[];
  cacheSeconds: number;
  caveat: string;
};

export type CountyDataSnapshot<T> = {
  configured: boolean;
  availability: "available" | "unavailable" | "disabled";
  records: T[];
  provenance: CountySourceDescriptor & {
    /** When Radius checked/normalized the source. The upstream body may be cached. */
    checkedAt: string;
    /** HTTP Date from the upstream response, when supplied. */
    sourceResponseAt?: string;
    /** Newest record-level edit/observation timestamp, when the layer provides one. */
    latestRecordUpdatedAt?: string;
  };
};

export type CountyPointGeometry = {
  type: "Point";
  coordinates: [number, number];
};

export type CountyLineGeometry = {
  type: "LineString" | "MultiLineString";
  coordinates: unknown;
};

export type CountyPolygonGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

export type CountyGeometry =
  | CountyPointGeometry
  | CountyLineGeometry
  | CountyPolygonGeometry;

export type CountyArcFeature = {
  type?: unknown;
  id?: unknown;
  geometry?: unknown;
  properties?: unknown;
};

type ArcGisPage = {
  type?: unknown;
  features?: unknown;
  exceededTransferLimit?: unknown;
  properties?: { exceededTransferLimit?: unknown };
  error?: unknown;
};

export type CountyArcGisFetch =
  | {
      ok: true;
      configured: true;
      features: CountyArcFeature[];
      checkedAt: string;
      sourceResponseAt?: string;
    }
  | {
      ok: false;
      configured: boolean;
      features: [];
      checkedAt: string;
      sourceResponseAt?: string;
    };

type CountyArcGisRequest = {
  sourceId: FrederickCountySourceId;
  endpoint: string;
  outFields: readonly string[];
  cacheSeconds: number;
  cacheTag: string;
  where?: string;
  timeoutMs?: number;
  pageSize?: number;
  maxPages?: number;
  geometryPrecision?: number;
  maxAllowableOffset?: number;
};

type NextFetchInit = RequestInit & {
  next?: { revalidate?: number; tags?: string[] };
};

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_PAGE_SIZE = 1_000;
const DEFAULT_MAX_PAGES = 20;

/**
 * Official public GIS layers run as live, attributed source reads by default.
 * They can be disabled globally during an incident. Attachment-bearing or
 * non-GIS sources keep the stricter, source-specific approval boundary.
 */
export function frederickCountySourceEnabled(
  sourceId: FrederickCountySourceId,
): boolean {
  if (
    (FREDERICK_COUNTY_PUBLIC_RUNTIME_SOURCE_IDS as readonly string[]).includes(
      sourceId,
    )
  ) {
    return process.env.FREDERICK_COUNTY_GIS_ENABLED !== "0";
  }
  if (process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED !== "1") return false;
  const approved = new Set(
    (process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return approved.has(sourceId);
}

/** @deprecated Use frederickCountySourceEnabled. */
export const frederickCountyReuseConfigured = frederickCountySourceEnabled;

function responseDate(headers: Headers): string | undefined {
  const raw = headers.get("date");
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function pageExceeded(page: ArcGisPage): boolean {
  return (
    page.exceededTransferLimit === true ||
    page.properties?.exceededTransferLimit === true
  );
}

function featureKey(feature: CountyArcFeature, fallback: number): string {
  const properties =
    feature.properties && typeof feature.properties === "object"
      ? (feature.properties as Record<string, unknown>)
      : {};
  const id = feature.id ?? properties.OBJECTID;
  return id == null ? `page-index:${fallback}` : `object:${String(id)}`;
}

export function buildCountyArcGisQueryUrl(
  request: Omit<CountyArcGisRequest, "cacheSeconds" | "cacheTag" | "timeoutMs" | "maxPages">,
  resultOffset: number,
): string {
  const url = new URL(request.endpoint);
  url.searchParams.set("where", request.where ?? "1=1");
  url.searchParams.set("outFields", request.outFields.join(","));
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("geometryPrecision", String(request.geometryPrecision ?? 5));
  url.searchParams.set("orderByFields", "OBJECTID ASC");
  url.searchParams.set("resultOffset", String(resultOffset));
  url.searchParams.set(
    "resultRecordCount",
    String(request.pageSize ?? DEFAULT_PAGE_SIZE),
  );
  if (
    typeof request.maxAllowableOffset === "number" &&
    Number.isFinite(request.maxAllowableOffset) &&
    request.maxAllowableOffset > 0
  ) {
    url.searchParams.set(
      "maxAllowableOffset",
      String(request.maxAllowableOffset),
    );
  }
  url.searchParams.set("f", "geojson");
  return url.toString();
}

/**
 * Fetch every page of an ArcGIS layer. A later-page failure invalidates the
 * whole pull; returning a plausible-looking partial layer would be worse than
 * reporting the source unavailable.
 */
export async function fetchCountyArcGis(
  request: CountyArcGisRequest,
): Promise<CountyArcGisFetch> {
  const checkedAt = new Date().toISOString();
  if (!frederickCountySourceEnabled(request.sourceId)) {
    return {
      ok: false,
      configured: false,
      features: [],
      checkedAt,
    };
  }
  const pageSize = Math.max(
    1,
    Math.min(2_000, Math.floor(request.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const maxPages = Math.max(
    1,
    Math.min(50, Math.floor(request.maxPages ?? DEFAULT_MAX_PAGES)),
  );
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(1, request.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  );
  const features: CountyArcFeature[] = [];
  const seen = new Set<string>();
  let sourceResponseAt: string | undefined;

  try {
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const resultOffset = pageIndex * pageSize;
      const url = buildCountyArcGisQueryUrl(
        { ...request, pageSize },
        resultOffset,
      );
      const init: NextFetchInit = {
        signal: controller.signal,
        headers: { Accept: "application/geo+json, application/json" },
        next: {
          revalidate: request.cacheSeconds,
          tags: [request.cacheTag],
        },
      };
      const response = await fetch(url, init);
      sourceResponseAt ??= responseDate(response.headers);
      if (!response.ok) {
        return {
          ok: false,
          configured: true,
          features: [],
          checkedAt,
          sourceResponseAt,
        };
      }

      const page = (await response.json()) as ArcGisPage;
      if (
        page.error != null ||
        page.type !== "FeatureCollection" ||
        !Array.isArray(page.features)
      ) {
        return {
          ok: false,
          configured: true,
          features: [],
          checkedAt,
          sourceResponseAt,
        };
      }

      const rows = page.features as CountyArcFeature[];
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const key = featureKey(row, resultOffset + rowIndex);
        if (seen.has(key)) continue;
        seen.add(key);
        features.push(row);
      }

      if (!pageExceeded(page)) {
        return {
          ok: true,
          configured: true,
          features,
          checkedAt,
          sourceResponseAt,
        };
      }
      if (rows.length === 0) {
        return {
          ok: false,
          configured: true,
          features: [],
          checkedAt,
          sourceResponseAt,
        };
      }
    }

    // The configured bound was exhausted while ArcGIS still said more data
    // existed. Do not return a silently incomplete layer.
    return {
      ok: false,
      configured: true,
      features: [],
      checkedAt,
      sourceResponseAt,
    };
  } catch {
    return {
      ok: false,
      configured: true,
      features: [],
      checkedAt,
      sourceResponseAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function countySnapshot<T>(
  source: CountySourceDescriptor,
  fetched: CountyArcGisFetch,
  records: T[],
  latestRecordUpdatedAt?: string,
): CountyDataSnapshot<T> {
  return {
    configured: fetched.configured,
    availability: !fetched.configured
      ? "disabled"
      : fetched.ok
        ? "available"
        : "unavailable",
    records: fetched.ok ? records : [],
    provenance: {
      ...source,
      checkedAt: fetched.checkedAt,
      sourceResponseAt: fetched.sourceResponseAt,
      latestRecordUpdatedAt,
    },
  };
}

const JUNK_TEXT = new Set(["", "N/A", "NA", "NONE", "NULL", "UNKNOWN", "TBD"]);

/** Small, public-text cleaner. It never interprets source text as HTML. */
export function cleanCountyValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || JUNK_TEXT.has(text.toUpperCase())) return undefined;
  return text;
}

export function countyObjectId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  const text = cleanCountyValue(value);
  return text && /^[A-Za-z0-9._:-]+$/.test(text) ? text : undefined;
}

export function countyHttpUrl(value: unknown): string | undefined {
  const text = cleanCountyValue(value);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function arcGisDateToIso(value: unknown): string | undefined {
  let date: Date;
  if (typeof value === "number" && Number.isFinite(value)) {
    date = new Date(value);
  } else if (typeof value === "string" && value.trim()) {
    date = new Date(value);
  } else {
    return undefined;
  }
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function collectPositions(value: unknown, output: Array<[number, number]>): void {
  if (output.length >= 100_000 || !Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    const lng = value[0];
    const lat = value[1];
    if (
      Number.isFinite(lng) &&
      Number.isFinite(lat) &&
      lng >= -180 &&
      lng <= 180 &&
      lat >= -90 &&
      lat <= 90
    ) {
      output.push([lng, lat]);
    }
    return;
  }
  for (const child of value) collectPositions(child, output);
}

function geometryOf(
  value: unknown,
  allowed: ReadonlySet<CountyGeometry["type"]>,
): CountyGeometry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (typeof geometry.type !== "string") return undefined;
  if (!allowed.has(geometry.type as CountyGeometry["type"])) return undefined;
  const positions: Array<[number, number]> = [];
  collectPositions(geometry.coordinates, positions);
  if (positions.length === 0) return undefined;

  // Reject malformed coordinate trees where only a subset of numeric points
  // survived validation. ArcGIS should never emit these; fail closed if it does.
  const [lng, lat] = positions.reduce(
    (sum, point) => [sum[0] + point[0], sum[1] + point[1]],
    [0, 0],
  );
  const centerLng = lng / positions.length;
  const centerLat = lat / positions.length;
  if (
    centerLat < 39.245 ||
    centerLat > 39.765 ||
    centerLng < -77.72 ||
    centerLng > -77.13
  ) {
    return undefined;
  }
  return geometry as CountyGeometry;
}

export function countyPointGeometry(value: unknown): CountyPointGeometry | undefined {
  return geometryOf(value, new Set(["Point"])) as CountyPointGeometry | undefined;
}

export function countyLineGeometry(value: unknown): CountyLineGeometry | undefined {
  return geometryOf(
    value,
    new Set(["LineString", "MultiLineString"]),
  ) as CountyLineGeometry | undefined;
}

export function countyPolygonGeometry(
  value: unknown,
): CountyPolygonGeometry | undefined {
  return geometryOf(
    value,
    new Set(["Polygon", "MultiPolygon"]),
  ) as CountyPolygonGeometry | undefined;
}

export function newestIso(values: Array<string | undefined>): string | undefined {
  let newest: string | undefined;
  let newestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > newestMs) {
      newestMs = parsed;
      newest = new Date(parsed).toISOString();
    }
  }
  return newest;
}
