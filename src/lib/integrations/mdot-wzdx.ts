/**
 * Maryland DOT Work Zone Data Exchange (WZDx) 4.1.
 *
 * This adapter intentionally exposes only the public trip-planning facts
 * Radius needs. Provider contacts, internal source ids, and unvalidated raw
 * properties stay behind this boundary.
 *
 * WZDx describes planned/active work zones. It does not prove a route is safe
 * or passable, so consumers must keep the `status` and `positionConfidence`
 * labels intact and combine this feed with active incidents/closures.
 */
import { isValidCoord } from "@/lib/geo";

export const MDOT_WZDX_SOURCE_URL =
  "https://filter.ritis.org/wzdx_v4.1/mdot.geojson";

const MAX_FEED_AGE_MS = 20 * 60 * 1_000;
const MAX_EVENT_UPDATE_AGE_MS = 6 * 60 * 60 * 1_000;
const FUTURE_SKEW_MS = 5 * 60 * 1_000;

type Position = [number, number];

export type MdotWorkZoneGeometry =
  | { type: "Point"; coordinates: Position }
  | { type: "MultiPoint"; coordinates: Position[] }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "MultiLineString"; coordinates: Position[][] };

export type MdotWorkZone = {
  id: string;
  road: string;
  roadNames: string[];
  description: string;
  direction?: string;
  status: "active" | "scheduled";
  startAt: string;
  endAt: string | null;
  updatedAt: string;
  geometry: MdotWorkZoneGeometry;
  lanes: {
    total: number;
    closed: number;
    summary: "all-lanes-closed" | "some-lanes-closed" | "all-lanes-open" | "unknown";
  };
  positionConfidence: "verified" | "approximate";
  sourceUrl: typeof MDOT_WZDX_SOURCE_URL;
};

export type MdotWorkZonesResult = {
  data: MdotWorkZone[];
  /** True only for a parseable, current WZDx 4.1 feed. */
  available: boolean;
  /** The publisher's update time, never the time Radius rendered the result. */
  asOf?: string;
  sourceUrl: typeof MDOT_WZDX_SOURCE_URL;
};

type RawObject = Record<string, unknown>;

function object(value: unknown): RawObject | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as RawObject
    : null;
}

function finite(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function iso(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isFresh(
  value: string,
  now: Date,
  maxAgeMs: number,
): boolean {
  const age = now.getTime() - Date.parse(value);
  return age >= -FUTURE_SKEW_MS && age <= maxAgeMs;
}

function position(value: unknown): Position | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = finite(value[0]);
  const lat = finite(value[1]);
  if (lng === null || lat === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return [lng, lat];
}

function positions(value: unknown): Position[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(position);
  return parsed.length > 0 && parsed.every((item): item is Position => item !== null)
    ? parsed
    : null;
}

function lineGroups(value: unknown): Position[][] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(positions);
  return parsed.length > 0 && parsed.every((item): item is Position[] => item !== null)
    ? parsed
    : null;
}

function normalizeGeometry(value: unknown): MdotWorkZoneGeometry | null {
  const raw = object(value);
  if (!raw || typeof raw.type !== "string") return null;
  switch (raw.type) {
    case "Point": {
      const parsed = position(raw.coordinates);
      return parsed ? { type: "Point", coordinates: parsed } : null;
    }
    case "MultiPoint":
    case "LineString": {
      const parsed = positions(raw.coordinates);
      return parsed ? { type: raw.type, coordinates: parsed } : null;
    }
    case "MultiLineString": {
      const parsed = lineGroups(raw.coordinates);
      return parsed ? { type: "MultiLineString", coordinates: parsed } : null;
    }
    default:
      return null;
  }
}

function lines(geometry: MdotWorkZoneGeometry): Position[][] {
  switch (geometry.type) {
    case "Point":
      return [[geometry.coordinates]];
    case "MultiPoint":
      return geometry.coordinates.map((point) => [point]);
    case "LineString":
      return [geometry.coordinates];
    case "MultiLineString":
      return geometry.coordinates;
  }
}

/**
 * A long state-road feature can cross Frederick while both endpoints sit just
 * outside it. Sample each segment as well as checking vertices so those zones
 * are not incorrectly discarded.
 */
function intersectsFrederick(geometry: MdotWorkZoneGeometry): boolean {
  for (const line of lines(geometry)) {
    for (const [lng, lat] of line) {
      if (isValidCoord({ lng, lat })) return true;
    }
    for (let i = 1; i < line.length; i += 1) {
      const [aLng, aLat] = line[i - 1];
      const [bLng, bLat] = line[i];
      for (let step = 1; step < 20; step += 1) {
        const ratio = step / 20;
        if (isValidCoord({
          lng: aLng + (bLng - aLng) * ratio,
          lat: aLat + (bLat - aLat) * ratio,
        })) return true;
      }
    }
  }
  return false;
}

function cleanText(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function routeName(value: unknown): string {
  const name = cleanText(value).toUpperCase();
  return name
    .replace(/^I-?(\d+)/, "I-$1")
    .replace(/^US-?(\d+)/, "US $1")
    .replace(/^MD-?(\d+)/, "MD $1");
}

function cleanDescription(value: unknown): string {
  return cleanText(value)
    .replace(/^Active Closure\s*@\s*/i, "")
    .replace(/\bCTY MP\b/gi, "county mile ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDirection(value: unknown): string | undefined {
  const direction = cleanText(value).toLowerCase();
  if (!direction || /^(none|unknown|other_no_additional_information)$/.test(direction)) {
    return undefined;
  }
  return direction;
}

function normalizeLaneSummary(properties: RawObject): MdotWorkZone["lanes"] {
  const rawLanes = Array.isArray(properties.lanes) ? properties.lanes : [];
  let total = 0;
  let closed = 0;
  for (const value of rawLanes) {
    const lane = object(value);
    if (!lane) continue;
    total += 1;
    if (cleanText(lane.status).toLowerCase() === "closed") closed += 1;
  }
  const impact = cleanText(properties.vehicle_impact).toLowerCase();
  let summary: MdotWorkZone["lanes"]["summary"] = "unknown";
  if (impact === "all-lanes-closed") summary = "all-lanes-closed";
  else if (impact === "some-lanes-closed") summary = "some-lanes-closed";
  else if (impact === "all-lanes-open") summary = "all-lanes-open";
  else if (total > 0 && closed === total) summary = "all-lanes-closed";
  else if (closed > 0) summary = "some-lanes-closed";
  else if (total > 0) summary = "all-lanes-open";
  return { total, closed, summary };
}

export function normalizeMdotWzdx(
  payload: unknown,
  now = new Date(),
): MdotWorkZonesResult {
  const unavailable: MdotWorkZonesResult = {
    data: [],
    available: false,
    sourceUrl: MDOT_WZDX_SOURCE_URL,
  };
  const root = object(payload);
  const feedInfo = object(root?.feed_info);
  const feedUpdatedAt = iso(feedInfo?.update_date);
  if (
    root?.type !== "FeatureCollection" ||
    feedInfo?.version !== "4.1" ||
    !feedUpdatedAt ||
    !isFresh(feedUpdatedAt, now, MAX_FEED_AGE_MS) ||
    !Array.isArray(root.features)
  ) {
    return unavailable;
  }

  const rows: MdotWorkZone[] = [];
  const seen = new Set<string>();
  for (const value of root.features) {
    const feature = object(value);
    const properties = object(feature?.properties);
    const core = object(properties?.core_details);
    if (!feature || !properties || !core || core.event_type !== "work-zone") continue;

    const id = cleanText(feature.id);
    if (!id || seen.has(id)) continue;
    const geometry = normalizeGeometry(feature.geometry);
    if (!geometry || !intersectsFrederick(geometry)) continue;

    const startAt = iso(properties.start_date);
    const endAt = properties.end_date == null ? null : iso(properties.end_date);
    const updatedAt = iso(core.update_date);
    if (!startAt || !updatedAt || (properties.end_date != null && !endAt)) continue;
    if (!isFresh(updatedAt, now, MAX_EVENT_UPDATE_AGE_MS)) continue;
    if (endAt && Date.parse(endAt) < now.getTime() - FUTURE_SKEW_MS) continue;
    if (endAt && Date.parse(endAt) < Date.parse(startAt)) continue;

    const roadNames = Array.isArray(core.road_names)
      ? core.road_names.map(routeName).filter(Boolean)
      : [];
    const description = cleanDescription(core.description);
    const road = roadNames[0] ?? "";
    if (!road || !description) continue;

    seen.add(id);
    rows.push({
      id,
      road,
      roadNames,
      description,
      direction: normalizeDirection(core.direction),
      status: Date.parse(startAt) <= now.getTime() + FUTURE_SKEW_MS
        ? "active"
        : "scheduled",
      startAt,
      endAt,
      updatedAt,
      geometry,
      lanes: normalizeLaneSummary(properties),
      positionConfidence:
        properties.is_start_position_verified === true &&
        (geometry.type === "Point" || geometry.type === "MultiPoint" ||
          properties.is_end_position_verified === true)
          ? "verified"
          : "approximate",
      sourceUrl: MDOT_WZDX_SOURCE_URL,
    });
  }

  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    if (a.lanes.summary !== b.lanes.summary) {
      return a.lanes.summary === "all-lanes-closed" ? -1 : 1;
    }
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });

  return {
    data: rows,
    available: true,
    asOf: feedUpdatedAt,
    sourceUrl: MDOT_WZDX_SOURCE_URL,
  };
}

export async function getMdotWorkZonesFrederickResult(
  {
    deadlineMs = 5_000,
    revalidateSeconds = 60,
  }: {
    deadlineMs?: number;
    revalidateSeconds?: number;
  } = {},
): Promise<MdotWorkZonesResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  try {
    const response = await fetch(MDOT_WZDX_SOURCE_URL, {
      headers: {
        Accept: "application/geo+json, application/json",
        "User-Agent":
          "FrederickRadius/1.0 (+https://frederickradius.app)",
      },
      signal: controller.signal,
      next: { revalidate: revalidateSeconds },
    });
    if (!response.ok) {
      return { data: [], available: false, sourceUrl: MDOT_WZDX_SOURCE_URL };
    }
    const payload = await response.json().catch(() => null);
    return normalizeMdotWzdx(payload);
  } catch {
    return { data: [], available: false, sourceUrl: MDOT_WZDX_SOURCE_URL };
  } finally {
    clearTimeout(timer);
  }
}

export async function getMdotWorkZonesFrederick(
  options: Parameters<typeof getMdotWorkZonesFrederickResult>[0] = {},
): Promise<MdotWorkZone[]> {
  return (await getMdotWorkZonesFrederickResult(options)).data;
}
