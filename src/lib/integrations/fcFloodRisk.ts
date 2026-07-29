/**
 * Frederick County static flood-context layers.
 *
 * These layers provide known high-water areas, physical warning-sign
 * locations, and locations with a recorded past water rescue. None of them
 * establish that flooding or an emergency is happening now.
 */
import {
  cleanCountyValue,
  countyObjectId,
  countyPointGeometry,
  countyPolygonGeometry,
  countySnapshot,
  fetchCountyArcGis,
  type CountyArcFeature,
  type CountyDataSnapshot,
  type CountyPointGeometry,
  type CountyPolygonGeometry,
  type CountySourceDescriptor,
} from "./fcCountySource";

const HIGH_WATER_SERVICE =
  "https://fcgis.frederickcountymd.gov/server_pub/rest/services/DPW/High_Water_Areas/MapServer";
const FLOOD_POINT_SERVICE =
  "https://fcgis.frederickcountymd.gov/server_pub/rest/services/PublicSafety/RoadwayFloodPoints/MapServer";
const HIGH_WATER_ENDPOINT = `${HIGH_WATER_SERVICE}/0/query`;
const WARNING_SIGN_ENDPOINT = `${FLOOD_POINT_SERVICE}/1/query`;
const PAST_RESCUE_ENDPOINT = `${FLOOD_POINT_SERVICE}/2/query`;
const HIGH_WATER_SOURCE_URL = `${HIGH_WATER_SERVICE}/0`;
const WARNING_SIGN_SOURCE_URL = `${FLOOD_POINT_SERVICE}/1`;
const PAST_RESCUE_SOURCE_URL = `${FLOOD_POINT_SERVICE}/2`;
const CACHE_SECONDS = 604_800;

export const FC_FLOOD_CONTEXT_SOURCE: CountySourceDescriptor = {
  id: "frederick-county-flood-context",
  ledgerId: "fc_high_water",
  title: "High-Water Areas and Flood Context",
  authority: "Frederick County Government",
  sourceUrl: HIGH_WATER_SERVICE,
  dataUrl: HIGH_WATER_ENDPOINT,
  supportingDataUrls: [WARNING_SIGN_ENDPOINT, PAST_RESCUE_ENDPOINT],
  cacheSeconds: CACHE_SECONDS,
  caveat:
    "A mapped risk area, warning sign, or past rescue location is not evidence of current flooding or a current road closure.",
};

export type CountyHighWaterArea = {
  id: string;
  kind: "mapped_high_water_area";
  creek?: string;
  geometry: CountyPolygonGeometry;
  sourceUrl: string;
  currentFlooding: "not_established";
};

export type CountyFloodContextPoint = {
  id: string;
  kind: "warning_sign" | "past_water_rescue";
  creek?: string;
  geometry: CountyPointGeometry;
  sourceUrl: string;
  currentIncident: "not_established";
};

export type CountyFloodContextRecord =
  | CountyHighWaterArea
  | CountyFloodContextPoint;

function propertiesOf(feature: CountyArcFeature): Record<string, unknown> {
  return feature.properties && typeof feature.properties === "object"
    ? (feature.properties as Record<string, unknown>)
    : {};
}

export function normalizeHighWaterAreas(
  features: CountyArcFeature[],
): CountyHighWaterArea[] {
  const records: CountyHighWaterArea[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const properties = propertiesOf(feature);
    const id = countyObjectId(properties.OBJECTID ?? feature.id);
    const geometry = countyPolygonGeometry(feature.geometry);
    if (!id || !geometry || seen.has(id)) continue;
    seen.add(id);
    records.push({
      id: `fc-high-water-${id}`,
      kind: "mapped_high_water_area",
      creek: cleanCountyValue(properties.CREEK),
      geometry,
      sourceUrl: HIGH_WATER_SOURCE_URL,
      currentFlooding: "not_established",
    });
  }
  return records;
}

export function normalizeFloodContextPoints(
  warningSigns: CountyArcFeature[],
  pastRescues: CountyArcFeature[],
): CountyFloodContextPoint[] {
  const records: CountyFloodContextPoint[] = [];
  for (const [kind, features] of [
    ["warning_sign", warningSigns],
    ["past_water_rescue", pastRescues],
  ] as const) {
    const seen = new Set<string>();
    for (const feature of features) {
      const properties = propertiesOf(feature);
      const id = countyObjectId(properties.OBJECTID ?? feature.id);
      const geometry = countyPointGeometry(feature.geometry);
      if (!id || !geometry || seen.has(id)) continue;
      seen.add(id);
      records.push({
        id: `fc-${kind}-${id}`,
        kind,
        creek: cleanCountyValue(properties.CREEK),
        geometry,
        sourceUrl:
          kind === "warning_sign"
            ? WARNING_SIGN_SOURCE_URL
            : PAST_RESCUE_SOURCE_URL,
        currentIncident: "not_established",
      });
    }
  }
  return records;
}

export async function getCountyFloodContext(): Promise<
  CountyDataSnapshot<CountyFloodContextRecord>
> {
  const [areas, signs, rescues] = await Promise.all([
    fetchCountyArcGis({
      sourceId: FC_FLOOD_CONTEXT_SOURCE.ledgerId,
      endpoint: HIGH_WATER_ENDPOINT,
      outFields: ["OBJECTID", "CREEK"],
      cacheSeconds: CACHE_SECONDS,
      cacheTag: "fc-high-water-areas",
      maxAllowableOffset: 0.00002,
    }),
    fetchCountyArcGis({
      sourceId: FC_FLOOD_CONTEXT_SOURCE.ledgerId,
      endpoint: WARNING_SIGN_ENDPOINT,
      outFields: ["OBJECTID", "CREEK"],
      cacheSeconds: CACHE_SECONDS,
      cacheTag: "fc-flood-warning-signs",
    }),
    fetchCountyArcGis({
      sourceId: FC_FLOOD_CONTEXT_SOURCE.ledgerId,
      endpoint: PAST_RESCUE_ENDPOINT,
      outFields: ["OBJECTID", "CREEK"],
      cacheSeconds: CACHE_SECONDS,
      cacheTag: "fc-past-water-rescues",
    }),
  ]);

  const gate = [areas, signs, rescues].find((result) => !result.configured);
  if (gate) return countySnapshot(FC_FLOOD_CONTEXT_SOURCE, gate, []);
  const failure = [areas, signs, rescues].find((result) => !result.ok);
  if (failure) return countySnapshot(FC_FLOOD_CONTEXT_SOURCE, failure, []);

  if (!areas.ok || !signs.ok || !rescues.ok) {
    // Narrowing for TypeScript; the failure branches above already returned.
    return countySnapshot(FC_FLOOD_CONTEXT_SOURCE, areas, []);
  }
  const records: CountyFloodContextRecord[] = [
    ...normalizeHighWaterAreas(areas.features),
    ...normalizeFloodContextPoints(signs.features, rescues.features),
  ];
  return countySnapshot(
    FC_FLOOD_CONTEXT_SOURCE,
    {
      ok: true,
      configured: true,
      features: [...areas.features, ...signs.features, ...rescues.features],
      checkedAt: areas.checkedAt,
      sourceResponseAt:
        areas.sourceResponseAt ?? signs.sourceResponseAt ?? rescues.sourceResponseAt,
    },
    records,
  );
}
