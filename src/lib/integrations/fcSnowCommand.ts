/**
 * Frederick County SnowCommand route status.
 *
 * Driver names, truck identifiers, property numbers, comments, and change-log
 * records are deliberately never requested. A route's status is an operations
 * report, not a road-safety determination. Old summer data remains "stale"
 * rather than being presented as live.
 */
import {
  arcGisDateToIso,
  cleanCountyValue,
  countyLineGeometry,
  countyObjectId,
  countySnapshot,
  fetchCountyArcGis,
  newestIso,
  type CountyArcFeature,
  type CountyDataSnapshot,
  type CountyLineGeometry,
  type CountySourceDescriptor,
} from "./fcCountySource";

const SERVICE_URL =
  "https://fcgis.frederickcountymd.gov/server_pub/rest/services/FeatureServices/SnowCommand/FeatureServer";
const ENDPOINT = `${SERVICE_URL}/0/query`;
const CACHE_SECONDS = 300;
const OUT_FIELDS = ["OBJECTID", "STATUS", "TIMESTAMP", "DISTRICT"] as const;
const CURRENT_WINDOW_MS = 12 * 60 * 60 * 1_000;

export const FC_SNOW_COMMAND_SOURCE: CountySourceDescriptor = {
  id: "frederick-county-snow-command",
  ledgerId: "fc_snow_command",
  title: "SnowCommand Snow Routes",
  authority: "Frederick County Government",
  sourceUrl: SERVICE_URL,
  dataUrl: ENDPOINT,
  cacheSeconds: CACHE_SECONDS,
  caveat:
    "A route status is an operational report, not proof that a road is safe or passable.",
};

export type CountySnowRouteStatus =
  | "clear"
  | "narrow_clear"
  | "emergency_access"
  | "closed"
  | "unknown";

export type CountySnowRoute = {
  id: string;
  district?: string;
  reportedStatus: CountySnowRouteStatus;
  observedAt?: string;
  freshness: "current" | "stale" | "unknown";
  geometry: CountyLineGeometry;
  roadSafety: "not_established";
};

function propertiesOf(feature: CountyArcFeature): Record<string, unknown> {
  return feature.properties && typeof feature.properties === "object"
    ? (feature.properties as Record<string, unknown>)
    : {};
}

export function normalizeSnowStatus(value: unknown): CountySnowRouteStatus {
  const normalized = cleanCountyValue(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "clear") return "clear";
  if (normalized === "narrow_clear") return "narrow_clear";
  if (normalized === "emergency_access") return "emergency_access";
  if (normalized === "closed") return "closed";
  return "unknown";
}

function freshnessOf(observedAt: string | undefined, now: Date): CountySnowRoute["freshness"] {
  if (!observedAt) return "unknown";
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs) || observedMs > now.getTime() + 5 * 60_000) {
    return "unknown";
  }
  return now.getTime() - observedMs <= CURRENT_WINDOW_MS ? "current" : "stale";
}

/** Pure source-boundary normalization. Sensitive operational fields cannot escape. */
export function normalizeCountySnowRoutes(
  features: CountyArcFeature[],
  now: Date = new Date(),
): CountySnowRoute[] {
  const records: CountySnowRoute[] = [];
  const seen = new Set<string>();

  for (const feature of features) {
    const properties = propertiesOf(feature);
    const id = countyObjectId(properties.OBJECTID ?? feature.id);
    const geometry = countyLineGeometry(feature.geometry);
    if (!id || !geometry || seen.has(id)) continue;
    seen.add(id);
    const observedAt = arcGisDateToIso(properties.TIMESTAMP);

    records.push({
      id: `fc-snow-route-${id}`,
      district: cleanCountyValue(properties.DISTRICT),
      reportedStatus: normalizeSnowStatus(properties.STATUS),
      observedAt,
      freshness: freshnessOf(observedAt, now),
      geometry,
      roadSafety: "not_established",
    });
  }

  return records.sort((a, b) => {
    const aTime = a.observedAt ? Date.parse(a.observedAt) : 0;
    const bTime = b.observedAt ? Date.parse(b.observedAt) : 0;
    return bTime - aTime || a.id.localeCompare(b.id);
  });
}

export async function getCountySnowRoutes(
  now: Date = new Date(),
): Promise<CountyDataSnapshot<CountySnowRoute>> {
  const fetched = await fetchCountyArcGis({
    sourceId: FC_SNOW_COMMAND_SOURCE.ledgerId,
    endpoint: ENDPOINT,
    outFields: OUT_FIELDS,
    cacheSeconds: CACHE_SECONDS,
    cacheTag: "fc-snow-command",
    maxAllowableOffset: 0.0001,
  });
  const records = fetched.ok ? normalizeCountySnowRoutes(fetched.features, now) : [];
  return countySnapshot(
    FC_SNOW_COMMAND_SOURCE,
    fetched,
    records,
    newestIso(records.map((record) => record.observedAt)),
  );
}
