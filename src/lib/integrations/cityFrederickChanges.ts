/**
 * Official City of Frederick change records used by the map's existing
 * "What changed?" scene.
 *
 * The City publishes these records through its public, keyless SpiresGIS
 * MapServer. This boundary keeps the public payload small, paginates without
 * silently truncating, attributes every record, and can serve a bounded
 * last-good snapshot from a warm process when SpiresGIS has a short outage.
 */
import { createHash } from "node:crypto";

const CITY_GIS_ROOT =
  "https://spires.cityoffrederick.com/arcgis/rest/services";
const CAPITAL_SERVICE = `${CITY_GIS_ROOT}/CapitalImprovementProjects/MapServer`;
const DEVELOPMENT_SERVICE = `${CITY_GIS_ROOT}/DevelopmentReview/MapServer`;
const CAPITAL_ENDPOINT = `${CAPITAL_SERVICE}/0/query`;
const DEVELOPMENT_ENDPOINT = `${DEVELOPMENT_SERVICE}/0/query`;
const CACHE_SECONDS = 21_600;
const MAX_STALE_MS = 30 * 24 * 60 * 60 * 1_000;
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGES = 4;

export const CITY_FREDERICK_CHANGE_SOURCE_IDS = [
  "cof_capital_improvement",
  "cof_development_review",
] as const;

export type CityFrederickChangeSourceId =
  (typeof CITY_FREDERICK_CHANGE_SOURCE_IDS)[number];

export const CITY_CAPITAL_PROJECTS_SOURCE = {
  id: "city-frederick-capital-improvement-projects",
  ledgerId: "cof_capital_improvement" as const,
  title: "Capital Improvement Projects",
  authority: "The City of Frederick",
  sourceUrl: CAPITAL_SERVICE,
  dataUrl: CAPITAL_ENDPOINT,
  cacheSeconds: CACHE_SECONDS,
  caveat:
    "The City project status is shown as published. A planning-stage capital project is not active construction.",
};

export const CITY_DEVELOPMENT_REVIEW_SOURCE = {
  id: "city-frederick-development-review",
  ledgerId: "cof_development_review" as const,
  title: "Development Review",
  authority: "The City of Frederick",
  sourceUrl: DEVELOPMENT_SERVICE,
  dataUrl: DEVELOPMENT_ENDPOINT,
  cacheSeconds: CACHE_SECONDS,
  caveat:
    "A development-review record describes a review process. Pending means under review, and complete does not by itself establish approval, permitting, or construction.",
};

export type CityChangeLifecycle =
  | "proposal"
  | "application_pending"
  | "review_complete"
  | "approved"
  | "planning"
  | "construction"
  | "complete"
  | "status_unknown";

type CityPointGeometry = {
  type: "Point";
  coordinates: [number, number];
};

type CityArcFeature = {
  id?: unknown;
  geometry?: unknown;
  properties?: unknown;
};

export type CityFrederickChangeRecord = {
  id: string;
  sourceId: CityFrederickChangeSourceId;
  sourceRecordId: string;
  kind: "capital_project" | "development_review";
  name: string;
  referenceId?: string;
  recordType?: string;
  reviewBody?: string;
  address?: string;
  district?: string;
  summary?: string;
  sourceStatus?: string;
  statusLabel: string;
  lifecycle: CityChangeLifecycle;
  constructionStatus: "reported" | "not_established";
  sourceUpdatedAt?: string;
  contentHash: string;
  geometry: CityPointGeometry;
};

export type CityFrederickChangeSnapshot = {
  configured: true;
  availability: "available" | "stale" | "unavailable";
  records: CityFrederickChangeRecord[];
  provenance: {
    checkedAt: string;
    dataCheckedAt?: string;
    sourceResponseAt?: string;
    latestRecordUpdatedAt?: string;
  };
};

type ArcPage = {
  type?: unknown;
  features?: unknown;
  exceededTransferLimit?: unknown;
  properties?: { exceededTransferLimit?: unknown };
  error?: unknown;
};

type NextFetchInit = RequestInit & {
  next?: { revalidate?: number; tags?: string[] };
};

type LastGood = {
  features: CityArcFeature[];
  dataCheckedAt: string;
  sourceResponseAt?: string;
};

const lastGoodBySource = new Map<CityFrederickChangeSourceId, LastGood>();

function cleanText(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || /^(?:n\/?a|none|null|unknown|tbd)$/i.test(text)) return undefined;
  return text.slice(0, maxLength);
}

function objectId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  const text = cleanText(value, 100);
  return text && /^[A-Za-z0-9._:-]+$/.test(text) ? text : undefined;
}

function globalId(value: unknown): string | undefined {
  const text = cleanText(value, 50)?.replace(/[{}]/g, "").toLowerCase();
  return text && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)
    ? text
    : undefined;
}

function pointGeometry(value: unknown): CityPointGeometry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type !== "Point" || !Array.isArray(geometry.coordinates)) {
    return undefined;
  }
  const [lng, lat] = geometry.coordinates;
  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lng < -77.55 ||
    lng > -77.25 ||
    lat < 39.34 ||
    lat > 39.56
  ) {
    return undefined;
  }
  return {
    type: "Point",
    coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))],
  };
}

function arcDate(value: unknown): string | undefined {
  const date =
    typeof value === "number" && Number.isFinite(value)
      ? new Date(value)
      : typeof value === "string" && value.trim()
        ? new Date(value)
        : null;
  return date && Number.isFinite(date.getTime())
    ? date.toISOString()
    : undefined;
}

function propertiesOf(feature: CityArcFeature): Record<string, unknown> {
  return feature.properties && typeof feature.properties === "object"
    ? (feature.properties as Record<string, unknown>)
    : {};
}

function stableHash(value: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function sourceResponseAt(headers: Headers): string | undefined {
  const value = headers.get("date");
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function pageExceeded(page: ArcPage): boolean {
  return (
    page.exceededTransferLimit === true ||
    page.properties?.exceededTransferLimit === true
  );
}

function featureKey(feature: CityArcFeature, fallback: number): string {
  const properties = propertiesOf(feature);
  return String(feature.id ?? properties.OBJECTID ?? fallback);
}

function buildQueryUrl(
  endpoint: string,
  outFields: readonly string[],
  where: string,
  offset: number,
): string {
  const url = new URL(endpoint);
  url.searchParams.set("where", where);
  url.searchParams.set("outFields", outFields.join(","));
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("geometryPrecision", "6");
  url.searchParams.set("orderByFields", "OBJECTID ASC");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(DEFAULT_PAGE_SIZE));
  url.searchParams.set("f", "geojson");
  return url.toString();
}

async function fetchPages(args: {
  sourceId: CityFrederickChangeSourceId;
  endpoint: string;
  outFields: readonly string[];
  where: string;
  cacheTag: string;
}): Promise<
  | {
      availability: "available";
      features: CityArcFeature[];
      checkedAt: string;
      dataCheckedAt: string;
      sourceResponseAt?: string;
    }
  | {
      availability: "stale" | "unavailable";
      features: CityArcFeature[];
      checkedAt: string;
      dataCheckedAt?: string;
      sourceResponseAt?: string;
    }
> {
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const features: CityArcFeature[] = [];
  const seen = new Set<string>();
  let responseAt: string | undefined;

  try {
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
      const offset = pageIndex * DEFAULT_PAGE_SIZE;
      const init: NextFetchInit = {
        signal: controller.signal,
        headers: { Accept: "application/geo+json, application/json" },
        next: {
          revalidate: CACHE_SECONDS,
          tags: [args.cacheTag],
        },
      };
      const response = await fetch(
        buildQueryUrl(args.endpoint, args.outFields, args.where, offset),
        init,
      );
      responseAt ??= sourceResponseAt(response.headers);
      if (!response.ok) throw new Error(`City GIS returned ${response.status}`);
      const page = (await response.json()) as ArcPage;
      if (
        page.error != null ||
        page.type !== "FeatureCollection" ||
        !Array.isArray(page.features)
      ) {
        throw new Error("City GIS returned an invalid GeoJSON page");
      }

      const rows = page.features as CityArcFeature[];
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const feature = rows[rowIndex];
        const key = featureKey(feature, offset + rowIndex);
        if (seen.has(key)) continue;
        seen.add(key);
        features.push(feature);
      }

      if (!pageExceeded(page)) {
        const dataCheckedAt = checkedAt;
        lastGoodBySource.set(args.sourceId, {
          features,
          dataCheckedAt,
          sourceResponseAt: responseAt,
        });
        return {
          availability: "available",
          features,
          checkedAt,
          dataCheckedAt,
          sourceResponseAt: responseAt,
        };
      }
      if (rows.length === 0) throw new Error("City GIS pagination stalled");
    }
    throw new Error("City GIS exceeded the bounded page limit");
  } catch {
    const lastGood = lastGoodBySource.get(args.sourceId);
    if (
      lastGood &&
      Date.parse(checkedAt) - Date.parse(lastGood.dataCheckedAt) <= MAX_STALE_MS
    ) {
      return {
        availability: "stale",
        features: lastGood.features,
        checkedAt,
        dataCheckedAt: lastGood.dataCheckedAt,
        sourceResponseAt: lastGood.sourceResponseAt,
      };
    }
    return {
      availability: "unavailable",
      features: [],
      checkedAt,
      sourceResponseAt: responseAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function capitalLifecycle(value: unknown): Pick<
  CityFrederickChangeRecord,
  "lifecycle" | "statusLabel" | "constructionStatus"
> {
  const status = cleanText(value, 80)?.toLowerCase();
  if (status === "planning") {
    return {
      lifecycle: "planning",
      statusLabel: "City project · Planning",
      constructionStatus: "not_established",
    };
  }
  if (status === "construction") {
    return {
      lifecycle: "construction",
      statusLabel: "City project · Construction",
      constructionStatus: "reported",
    };
  }
  if (status === "complete") {
    return {
      lifecycle: "complete",
      statusLabel: "City project · Complete",
      constructionStatus: "not_established",
    };
  }
  return {
    lifecycle: "status_unknown",
    statusLabel: "City project · Status not provided",
    constructionStatus: "not_established",
  };
}

function reviewLifecycle(value: unknown): Pick<
  CityFrederickChangeRecord,
  "lifecycle" | "statusLabel" | "constructionStatus"
> {
  const status = cleanText(value, 80)?.toLowerCase();
  if (status === "pending") {
    return {
      lifecycle: "application_pending",
      statusLabel: "Development review · Pending",
      constructionStatus: "not_established",
    };
  }
  if (status === "complete") {
    return {
      lifecycle: "review_complete",
      statusLabel: "Development review · Review complete",
      constructionStatus: "not_established",
    };
  }
  return {
    lifecycle: "status_unknown",
    statusLabel: "Development review · Status not provided",
    constructionStatus: "not_established",
  };
}

function normalizeCapitalProjects(
  features: CityArcFeature[],
): CityFrederickChangeRecord[] {
  const records: CityFrederickChangeRecord[] = [];
  const seen = new Set<string>();

  for (const feature of features) {
    const properties = propertiesOf(feature);
    const geometry = pointGeometry(feature.geometry);
    const name = cleanText(properties.PROJECT_NAME, 255);
    const fallbackId = objectId(properties.OBJECTID ?? feature.id);
    const sourceRecordId =
      globalId(properties.GlobalID) ??
      cleanText(properties.PROJECT_NUMBER, 100) ??
      fallbackId;
    if (!geometry || !name || !sourceRecordId || seen.has(sourceRecordId)) {
      continue;
    }
    seen.add(sourceRecordId);

    const referenceId = cleanText(properties.PROJECT_NUMBER, 100);
    const recordType = cleanText(properties.Type, 100);
    const address = cleanText(properties.ADDRESS, 255);
    const district = cleanText(properties.DISTRICT, 40);
    const sourceStatus = cleanText(properties.STATUS, 80);
    const sourceUpdatedAt = arcDate(properties.last_edited_date);
    const lifecycle = capitalLifecycle(properties.STATUS);
    const hashFields = {
      sourceRecordId,
      name,
      referenceId,
      recordType,
      address,
      district,
      sourceStatus,
      lifecycle: lifecycle.lifecycle,
      geometry: geometry.coordinates,
    };

    records.push({
      id: `cof-cip-${sourceRecordId}`,
      sourceId: CITY_CAPITAL_PROJECTS_SOURCE.ledgerId,
      sourceRecordId,
      kind: "capital_project",
      name,
      referenceId,
      recordType,
      address,
      district,
      sourceStatus,
      sourceUpdatedAt,
      contentHash: stableHash(hashFields),
      geometry,
      ...lifecycle,
    });
  }

  return records;
}

function normalizeDevelopmentReviews(
  features: CityArcFeature[],
): CityFrederickChangeRecord[] {
  const records: CityFrederickChangeRecord[] = [];
  const seen = new Set<string>();

  for (const feature of features) {
    const properties = propertiesOf(feature);
    const geometry = pointGeometry(feature.geometry);
    const name = cleanText(properties.Name, 255);
    const fallbackId = objectId(properties.OBJECTID ?? feature.id);
    const sourceRecordId =
      globalId(properties.GlobalID) ?? cleanText(properties.caseId, 100) ?? fallbackId;
    if (!geometry || !name || !sourceRecordId || seen.has(sourceRecordId)) {
      continue;
    }
    seen.add(sourceRecordId);

    const referenceId = cleanText(properties.caseId, 100);
    const recordType = cleanText(properties.type, 120);
    const reviewBody = cleanText(properties.commission, 120);
    const summary = cleanText(properties.Description, 500);
    const sourceStatus = cleanText(properties.status, 80);
    const sourceUpdatedAt = arcDate(properties.last_edited_date);
    const lifecycle = reviewLifecycle(properties.status);
    const hashFields = {
      sourceRecordId,
      name,
      referenceId,
      recordType,
      reviewBody,
      summary,
      sourceStatus,
      lifecycle: lifecycle.lifecycle,
      geometry: geometry.coordinates,
    };

    records.push({
      id: `cof-review-${sourceRecordId}`,
      sourceId: CITY_DEVELOPMENT_REVIEW_SOURCE.ledgerId,
      sourceRecordId,
      kind: "development_review",
      name,
      referenceId,
      recordType,
      reviewBody,
      summary,
      sourceStatus,
      sourceUpdatedAt,
      contentHash: stableHash(hashFields),
      geometry,
      ...lifecycle,
    });
  }

  return records;
}

function newestIso(values: Array<string | undefined>): string | undefined {
  return values.reduce<string | undefined>((newest, value) => {
    if (!value) return newest;
    return !newest || Date.parse(value) > Date.parse(newest) ? value : newest;
  }, undefined);
}

async function sourceSnapshot(args: {
  sourceId: CityFrederickChangeSourceId;
  endpoint: string;
  outFields: readonly string[];
  where: string;
  cacheTag: string;
  normalize: (features: CityArcFeature[]) => CityFrederickChangeRecord[];
}): Promise<CityFrederickChangeSnapshot> {
  const fetched = await fetchPages(args);
  const records =
    fetched.availability === "available" || fetched.availability === "stale"
      ? args.normalize(fetched.features)
      : [];
  return {
    configured: true,
    availability: fetched.availability,
    records,
    provenance: {
      checkedAt: fetched.checkedAt,
      dataCheckedAt: fetched.dataCheckedAt,
      sourceResponseAt: fetched.sourceResponseAt,
      latestRecordUpdatedAt: newestIso(
        records.map((record) => record.sourceUpdatedAt),
      ),
    },
  };
}

export async function getCityCapitalProjects(): Promise<CityFrederickChangeSnapshot> {
  return sourceSnapshot({
    sourceId: CITY_CAPITAL_PROJECTS_SOURCE.ledgerId,
    endpoint: CITY_CAPITAL_PROJECTS_SOURCE.dataUrl,
    // The map is a current-change surface. Completed capital projects belong
    // in the future version history, not in a permanent wall of old pins.
    where: "STATUS <> 'Complete' OR STATUS IS NULL",
    outFields: [
      "OBJECTID",
      "GlobalID",
      "PROJECT_NUMBER",
      "PROJECT_NAME",
      "STATUS",
      "ADDRESS",
      "Type",
      "DISTRICT",
      "last_edited_date",
    ],
    cacheTag: "cof-capital-improvement",
    normalize: normalizeCapitalProjects,
  });
}

export async function getCityDevelopmentReviews(): Promise<CityFrederickChangeSnapshot> {
  return sourceSnapshot({
    sourceId: CITY_DEVELOPMENT_REVIEW_SOURCE.ledgerId,
    endpoint: CITY_DEVELOPMENT_REVIEW_SOURCE.dataUrl,
    // A completed review is not necessarily an approval. Until Radius stores
    // version history, show only records the City currently marks Pending.
    where: "status = 'Pending'",
    outFields: [
      "OBJECTID",
      "GlobalID",
      "caseId",
      "Name",
      "commission",
      "status",
      "type",
      "Description",
      "last_edited_date",
    ],
    cacheTag: "cof-development-review",
    normalize: normalizeDevelopmentReviews,
  });
}

export async function getCityFrederickChangeRecords(): Promise<{
  capital: CityFrederickChangeSnapshot;
  development: CityFrederickChangeSnapshot;
}> {
  const [capital, development] = await Promise.all([
    getCityCapitalProjects(),
    getCityDevelopmentReviews(),
  ]);
  return { capital, development };
}

/** Test-only warm-cache reset. */
export function resetCityFrederickChangeCache(): void {
  lastGoodBySource.clear();
}
