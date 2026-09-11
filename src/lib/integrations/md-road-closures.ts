/**
 * Maryland SHA's public active-road-closure service, reduced to Frederick
 * County and to the facts a traveler can act on.
 *
 * The service publishes the same closure twice: a point carrying the canonical
 * public details and one or more road segments carrying the useful geometry.
 * Point attributes win when the two layers drift; segment rows contribute only
 * geometry. That prevents an older segment record from quietly changing a
 * closure's official dates or status.
 */
import { isValidCoord } from "@/lib/geo";
import type { RoadWorkZoneFC } from "@/components/map/types";

export const MD_ROAD_CLOSURES_SOURCE_URL =
  "https://mdgeodata.md.gov/appdata/rest/services/SHA_RoadClosure/RoadClosureActive/MapServer";

const FREDERICK_COUNTY_FIPS = "24021";
const PAGE_SIZE = 250;
const MAX_PAGES = 12;
const DEFAULT_DEADLINE_MS = 3_500;
const DEFAULT_REVALIDATE_SECONDS = 60;
const MAX_SOURCE_AGE_MS = 10 * 60 * 1_000;
const FUTURE_SKEW_MS = 5 * 60 * 1_000;

const POINT_FIELDS = [
  "OBJECTID",
  "ClosureStart",
  "ClosureEnd",
  "ClosureType",
  "CreationDate",
  "EditDate",
  "Comments",
  "RoadName",
  "CrossStreet1",
  "CrossStreet2",
  "ClosureSummary",
  "Jurisdiction",
  "CountyFips",
  "RC_GUID",
  "typeSummary",
  "Direction",
  "Lanes",
] as const;

const SEGMENT_FIELDS = [
  "OBJECTID",
  "ClosureStart",
  "ClosureEnd",
  "ClosureType",
  "CreationDate",
  "EditDate",
  "Comments",
  "RoadName",
  "CrossStreet1",
  "CrossStreet2",
  "closureSummary",
  "Jurisdiction",
  "CountyFips",
  "RC_GUID",
  "typeSummary",
] as const;

type JsonObject = Record<string, unknown>;
type Position = [number, number];
type ClosureGeometry =
  | { type: "Point"; coordinates: Position }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "MultiLineString"; coordinates: Position[][] };

export type MarylandRoadClosure = {
  id: string;
  road: string;
  summary: string;
  detail?: string;
  closureType: string;
  lifecycle: "current" | "scheduled";
  startAt: string;
  endAt: string | null;
  updatedAt: string | null;
  direction?: string;
  lanes?: string;
  crossStreets?: string;
  jurisdiction?: string;
  geometry: ClosureGeometry;
  sourceUrl: typeof MD_ROAD_CLOSURES_SOURCE_URL;
};

export type MarylandRoadClosureAvailability =
  | "current"
  | "stale"
  | "unavailable";

export type MarylandRoadClosureResult = {
  data: MarylandRoadClosure[];
  availability: MarylandRoadClosureAvailability;
  coverage: "complete" | "partial" | "none";
  checkedAt: string;
  sourceAsOf: string | null;
  sourceUrl: typeof MD_ROAD_CLOSURES_SOURCE_URL;
};

type RawFeature = {
  id?: unknown;
  geometry?: unknown;
  properties?: unknown;
};

type LayerPage = {
  type?: unknown;
  features?: unknown;
  exceededTransferLimit?: unknown;
  properties?: { exceededTransferLimit?: unknown };
};

type LayerFetch = {
  available: boolean;
  complete: boolean;
  features: RawFeature[];
  sourceTimes: string[];
};

function object(value: unknown): JsonObject | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function cleanText(value: unknown, maxLength = 1_000): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function finite(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function position(value: unknown): Position | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = finite(value[0]);
  const lat = finite(value[1]);
  if (lng === null || lat === null || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
    return null;
  }
  return [lng, lat];
}

function positions(value: unknown): Position[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(position);
  if (
    parsed.length < 2 ||
    !parsed.every((item): item is Position => item !== null)
  ) {
    return null;
  }
  return parsed;
}

function geometry(value: unknown): ClosureGeometry | null {
  const raw = object(value);
  if (!raw || typeof raw.type !== "string") return null;
  if (raw.type === "Point") {
    const parsed = position(raw.coordinates);
    return parsed && isValidCoord({ lng: parsed[0], lat: parsed[1] })
      ? { type: "Point", coordinates: parsed }
      : null;
  }
  if (raw.type === "LineString") {
    const parsed = positions(raw.coordinates);
    return parsed && parsed.some(([lng, lat]) => isValidCoord({ lng, lat }))
      ? { type: "LineString", coordinates: parsed }
      : null;
  }
  if (raw.type === "MultiLineString" && Array.isArray(raw.coordinates)) {
    const parsed = raw.coordinates.map(positions);
    if (
      parsed.length === 0 ||
      !parsed.every((line): line is Position[] => line !== null) ||
      !parsed.some((line) =>
        line.some(([lng, lat]) => isValidCoord({ lng, lat })),
      )
    ) {
      return null;
    }
    return { type: "MultiLineString", coordinates: parsed };
  }
  return null;
}

function featureKey(feature: RawFeature, fallback: number): string {
  const properties = object(feature.properties);
  const id = cleanText(properties?.OBJECTID ?? feature.id, 80);
  return id || `row-${fallback}`;
}

function guid(properties: JsonObject, layer: "point" | "segment"): string {
  const raw = cleanText(properties.RC_GUID, 80)
    .replace(/[{}]/g, "")
    .toLowerCase();
  const objectId = cleanText(properties.OBJECTID, 80);
  return raw || `${layer}-${objectId}`;
}

function sourceTime(response: Response, checkedAt: Date): string {
  const date = response.headers.get("date");
  const ageSeconds = finite(response.headers.get("age")) ?? 0;
  const parsed = date ? Date.parse(date) : NaN;
  if (!Number.isFinite(parsed)) return checkedAt.toISOString();
  const apparentAgeMs = Math.max(0, checkedAt.getTime() - parsed);
  const correctedAgeMs = Math.max(
    apparentAgeMs,
    Math.max(0, ageSeconds) * 1_000,
  );
  return new Date(checkedAt.getTime() - correctedAgeMs).toISOString();
}

function queryUrl(
  layer: 0 | 1,
  fields: readonly string[],
  offset: number,
): string {
  const url = new URL(`${MD_ROAD_CLOSURES_SOURCE_URL}/${layer}/query`);
  url.searchParams.set("where", `CountyFips='${FREDERICK_COUNTY_FIPS}'`);
  url.searchParams.set("outFields", fields.join(","));
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "geojson");
  url.searchParams.set("orderByFields", "OBJECTID ASC");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(PAGE_SIZE));
  return url.toString();
}

async function fetchLayer({
  layer,
  fields,
  checkedAt,
  signal,
  revalidateSeconds,
}: {
  layer: 0 | 1;
  fields: readonly string[];
  checkedAt: Date;
  signal: AbortSignal;
  revalidateSeconds: number;
}): Promise<LayerFetch> {
  const features: RawFeature[] = [];
  const seen = new Set<string>();
  const sourceTimes: string[] = [];

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    try {
      const response = await fetch(
        queryUrl(layer, fields, pageIndex * PAGE_SIZE),
        {
          headers: {
            Accept: "application/geo+json, application/json",
            "User-Agent":
              "FrederickRadius/1.0 (+https://frederickradius.app)",
          },
          signal,
          next: { revalidate: revalidateSeconds },
        },
      );
      if (!response.ok) {
        return { available: false, complete: false, features: [], sourceTimes };
      }
      sourceTimes.push(sourceTime(response, checkedAt));
      const payload = (await response.json().catch(() => null)) as
        | LayerPage
        | null;
      if (
        payload?.type !== "FeatureCollection" ||
        !Array.isArray(payload.features)
      ) {
        return { available: false, complete: false, features: [], sourceTimes };
      }

      let added = 0;
      for (const [rowIndex, value] of payload.features.entries()) {
        const row = object(value) as RawFeature | null;
        if (!row) continue;
        const key = featureKey(row, pageIndex * PAGE_SIZE + rowIndex);
        if (seen.has(key)) continue;
        seen.add(key);
        features.push(row);
        added += 1;
      }

      const exceeded =
        payload.exceededTransferLimit === true ||
        payload.properties?.exceededTransferLimit === true;
      if (!exceeded && payload.features.length < PAGE_SIZE) {
        return { available: true, complete: true, features, sourceTimes };
      }
      // A provider returning the same full page forever is not a complete
      // snapshot. Stop without publishing a trustworthy-empty claim.
      if (added === 0) {
        return { available: true, complete: false, features, sourceTimes };
      }
    } catch {
      return { available: false, complete: false, features: [], sourceTimes };
    }
  }

  return { available: true, complete: false, features, sourceTimes };
}

function linesFromGeometry(value: ClosureGeometry): Position[][] {
  if (value.type === "LineString") return [value.coordinates];
  if (value.type === "MultiLineString") return value.coordinates;
  return [];
}

function featureProperties(feature: RawFeature): JsonObject | null {
  return object(feature.properties);
}

function canonicalProperties(
  points: RawFeature[],
  segments: RawFeature[],
): Map<string, { properties: JsonObject; point: ClosureGeometry | null }> {
  const canonical = new Map<
    string,
    { properties: JsonObject; point: ClosureGeometry | null }
  >();
  for (const feature of points) {
    const properties = featureProperties(feature);
    if (!properties || cleanText(properties.CountyFips) !== FREDERICK_COUNTY_FIPS) {
      continue;
    }
    canonical.set(guid(properties, "point"), {
      properties,
      point: geometry(feature.geometry),
    });
  }
  // Segment attributes are fallback-only. Never replace a point record: the
  // service's segment layer can lag its canonical point dates.
  for (const feature of segments) {
    const properties = featureProperties(feature);
    if (!properties || cleanText(properties.CountyFips) !== FREDERICK_COUNTY_FIPS) {
      continue;
    }
    const id = guid(properties, "segment");
    if (!canonical.has(id)) {
      canonical.set(id, { properties, point: null });
    }
  }
  return canonical;
}

function segmentLines(segments: RawFeature[]): Map<string, Position[][]> {
  const byClosure = new Map<string, Position[][]>();
  for (const feature of segments) {
    const properties = featureProperties(feature);
    if (!properties || cleanText(properties.CountyFips) !== FREDERICK_COUNTY_FIPS) {
      continue;
    }
    const parsed = geometry(feature.geometry);
    if (!parsed || parsed.type === "Point") continue;
    const id = guid(properties, "segment");
    byClosure.set(id, [
      ...(byClosure.get(id) ?? []),
      ...linesFromGeometry(parsed),
    ]);
  }
  return byClosure;
}

function closureGeometry(
  lines: Position[][] | undefined,
  point: ClosureGeometry | null,
): ClosureGeometry | null {
  if (lines?.length === 1) {
    return { type: "LineString", coordinates: lines[0] };
  }
  if (lines && lines.length > 1) {
    return { type: "MultiLineString", coordinates: lines };
  }
  return point?.type === "Point" ? point : null;
}

function lifecycle(
  startAt: string,
  endAt: string | null,
  now: Date,
): "current" | "scheduled" | "expired" | "invalid" {
  const start = Date.parse(startAt);
  const end = endAt ? Date.parse(endAt) : null;
  if (!Number.isFinite(start) || (end !== null && !Number.isFinite(end))) {
    return "invalid";
  }
  if (end !== null && end < start) return "invalid";
  if (end !== null && end < now.getTime() - FUTURE_SKEW_MS) return "expired";
  return start > now.getTime() + FUTURE_SKEW_MS ? "scheduled" : "current";
}

function crossStreetLabel(properties: JsonObject): string | undefined {
  const values = [properties.CrossStreet1, properties.CrossStreet2]
    .map((value) => cleanText(value, 80))
    .filter(Boolean);
  return values.length > 0 ? values.join(" to ") : undefined;
}

function sourceAvailability(
  sourceAsOf: string | null,
  checkedAt: Date,
): Exclude<MarylandRoadClosureAvailability, "unavailable"> {
  if (!sourceAsOf) return "stale";
  const age = checkedAt.getTime() - Date.parse(sourceAsOf);
  return Number.isFinite(age) && age >= -FUTURE_SKEW_MS && age <= MAX_SOURCE_AGE_MS
    ? "current"
    : "stale";
}

export function normalizeMarylandRoadClosureLayers({
  points,
  segments,
  pointAvailable = true,
  segmentAvailable = true,
  checkedAt = new Date(),
  sourceAsOf = checkedAt.toISOString(),
}: {
  points: RawFeature[];
  segments: RawFeature[];
  pointAvailable?: boolean;
  segmentAvailable?: boolean;
  checkedAt?: Date;
  sourceAsOf?: string | null;
}): MarylandRoadClosureResult {
  const coverage = pointAvailable && segmentAvailable
    ? "complete"
    : pointAvailable || segmentAvailable
      ? "partial"
      : "none";
  if (coverage === "none") {
    return {
      data: [],
      availability: "unavailable",
      coverage,
      checkedAt: checkedAt.toISOString(),
      sourceAsOf,
      sourceUrl: MD_ROAD_CLOSURES_SOURCE_URL,
    };
  }

  const canonical = canonicalProperties(points, segments);
  const lines = segmentLines(segments);
  const records: MarylandRoadClosure[] = [];
  for (const [key, value] of canonical) {
    const { properties } = value;
    const road = cleanText(properties.RoadName, 100);
    const closureType = cleanText(properties.ClosureType, 80);
    const startAt = iso(properties.ClosureStart);
    const endAt = properties.ClosureEnd == null
      ? null
      : iso(properties.ClosureEnd);
    const parsedGeometry = closureGeometry(lines.get(key), value.point);
    if (!road || !closureType || !startAt || !parsedGeometry) continue;
    const state = lifecycle(startAt, endAt, checkedAt);
    if (state === "expired" || state === "invalid") continue;

    const officialSummary = cleanText(
      properties.ClosureSummary ?? properties.closureSummary,
      500,
    );
    const detail = cleanText(properties.Comments, 700);
    const updatedAt = iso(properties.EditDate ?? properties.CreationDate);
    records.push({
      id: `md-road-closure-${key}`,
      road,
      summary: officialSummary || `${closureType} on ${road}`,
      ...(detail ? { detail } : {}),
      closureType,
      lifecycle: state,
      startAt,
      endAt,
      updatedAt,
      ...(cleanText(properties.Direction, 80)
        ? { direction: cleanText(properties.Direction, 80) }
        : {}),
      ...(cleanText(properties.Lanes, 50)
        ? { lanes: cleanText(properties.Lanes, 50) }
        : {}),
      ...(crossStreetLabel(properties)
        ? { crossStreets: crossStreetLabel(properties) }
        : {}),
      ...(cleanText(properties.Jurisdiction, 100)
        ? { jurisdiction: cleanText(properties.Jurisdiction, 100) }
        : {}),
      geometry: parsedGeometry,
      sourceUrl: MD_ROAD_CLOSURES_SOURCE_URL,
    });
  }

  records.sort((left, right) => {
    if (left.lifecycle !== right.lifecycle) {
      return left.lifecycle === "current" ? -1 : 1;
    }
    return Date.parse(left.startAt) - Date.parse(right.startAt) ||
      left.road.localeCompare(right.road) ||
      left.id.localeCompare(right.id);
  });

  return {
    data: records,
    availability: sourceAvailability(sourceAsOf, checkedAt),
    coverage,
    checkedAt: checkedAt.toISOString(),
    sourceAsOf,
    sourceUrl: MD_ROAD_CLOSURES_SOURCE_URL,
  };
}

export async function getMarylandRoadClosuresFrederick({
  deadlineMs = DEFAULT_DEADLINE_MS,
  revalidateSeconds = DEFAULT_REVALIDATE_SECONDS,
  now = new Date(),
}: {
  deadlineMs?: number;
  revalidateSeconds?: number;
  now?: Date;
} = {}): Promise<MarylandRoadClosureResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  try {
    const [points, segments] = await Promise.all([
      fetchLayer({
        layer: 0,
        fields: POINT_FIELDS,
        checkedAt: now,
        signal: controller.signal,
        revalidateSeconds,
      }),
      fetchLayer({
        layer: 1,
        fields: SEGMENT_FIELDS,
        checkedAt: now,
        signal: controller.signal,
        revalidateSeconds,
      }),
    ]);
    const completePoints = points.available && points.complete;
    const completeSegments = segments.available && segments.complete;
    const times = [...points.sourceTimes, ...segments.sourceTimes]
      .map((value) => Date.parse(value))
      .filter(Number.isFinite);
    const sourceAsOf = times.length > 0
      ? new Date(Math.min(...times)).toISOString()
      : null;

    return normalizeMarylandRoadClosureLayers({
      points: points.features,
      segments: segments.features,
      pointAvailable: completePoints,
      segmentAvailable: completeSegments,
      checkedAt: now,
      sourceAsOf,
    });
  } finally {
    clearTimeout(timer);
  }
}

function laneImpact(record: MarylandRoadClosure): string {
  const type = record.closureType.toLowerCase();
  if (type === "closed") return "All lanes closed";
  if (type.includes("curb lane")) return "Curb lane closure";
  if (type.includes("limited public")) return "Limited public access";
  if (type.includes("emergency vehicle")) {
    return "Emergency-vehicle access only";
  }
  return record.closureType;
}

export function marylandRoadClosuresGeoJson(
  result: MarylandRoadClosureResult,
): RoadWorkZoneFC {
  return {
    type: "FeatureCollection",
    features: result.data.map((record) => ({
      type: "Feature" as const,
      id: record.id,
      geometry: record.geometry,
      properties: {
        id: record.id,
        road: record.road,
        title: record.summary,
        ...(record.detail ? { detail: record.detail } : {}),
        laneImpact: laneImpact(record),
        status:
          record.lifecycle === "current"
            ? "Current closure"
            : "Scheduled closure",
        lifecycle: record.lifecycle,
        impactKind:
          record.closureType.toLowerCase() === "closed"
            ? "closure"
            : "limited",
        startAt: record.startAt,
        ...(record.endAt ? { endAt: record.endAt } : {}),
        ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
        checkedAt: result.checkedAt,
        ...(record.crossStreets ? { crossStreets: record.crossStreets } : {}),
        sourceLabel: "Maryland SHA road closures",
        sourceUrl: record.sourceUrl,
      },
    })),
  };
}
