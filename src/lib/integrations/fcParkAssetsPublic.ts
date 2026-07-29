/**
 * Public-safe Frederick County park assets.
 *
 * Cartegraph contains inspection notes, condition scores, cost, ownership,
 * maintenance, internal users, and tag numbers. None of those fields are
 * requested or represented here. The allowlist is intentionally smaller than
 * the source layer and distinguishes a drinking fountain from an unspecified
 * water fixture.
 */
import {
  arcGisDateToIso,
  cleanCountyValue,
  countyObjectId,
  countyPointGeometry,
  countySnapshot,
  fetchCountyArcGis,
  newestIso,
  type CountyArcFeature,
  type CountyDataSnapshot,
  type CountyPointGeometry,
  type CountySourceDescriptor,
} from "./fcCountySource";

const SERVICE_URL =
  "https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Assets/MapServer";
const BENCH_ENDPOINT = `${SERVICE_URL}/1/query`;
const AMENITY_ENDPOINT = `${SERVICE_URL}/6/query`;
const CACHE_SECONDS = 604_800;
const OUT_FIELDS = [
  "OBJECTID",
  "ParkName",
  "Type1",
  "Retired",
  "last_edited_date",
] as const;

export const FC_PARK_ASSETS_SOURCE: CountySourceDescriptor = {
  id: "frederick-county-public-park-assets",
  ledgerId: "fc_parks_assets",
  title: "Parks and Recreation Assets",
  authority: "Frederick County Government",
  sourceUrl: SERVICE_URL,
  dataUrl: BENCH_ENDPOINT,
  supportingDataUrls: [AMENITY_ENDPOINT],
  cacheSeconds: CACHE_SECONDS,
  caveat:
    "A mapped asset is not confirmation that it is currently available, working, accessible, or safe to use.",
};

export type PublicParkAssetKind =
  | "bench"
  | "bike_rack"
  | "bike_repair"
  | "boat_ramp"
  | "paddle_launch"
  | "dog_park"
  | "drinking_water"
  | "water_fixture"
  | "grill"
  | "picnic_table"
  | "portable_toilet"
  | "recycling"
  | "trash";

export type PublicParkAsset = {
  id: string;
  kind: PublicParkAssetKind;
  parkName?: string;
  geometry: CountyPointGeometry;
  sourceUpdatedAt?: string;
  availability: "unknown";
  /** True only when the source explicitly calls it a drinking fountain. */
  potable: true | null;
};

const PUBLIC_AMENITY_TYPES: Readonly<Record<string, PublicParkAssetKind>> = {
  "bike rack": "bike_rack",
  "bike repair station": "bike_repair",
  "boat ramp": "boat_ramp",
  "canoe & kayak ramp": "paddle_launch",
  "dog park": "dog_park",
  "drinking fountain": "drinking_water",
  grills: "grill",
  "picnic table": "picnic_table",
  "portable toilet": "portable_toilet",
  "recycling receptacle": "recycling",
  "trash receptacle": "trash",
  "water fountains/hose bibs": "water_fixture",
};

function propertiesOf(feature: CountyArcFeature): Record<string, unknown> {
  return feature.properties && typeof feature.properties === "object"
    ? (feature.properties as Record<string, unknown>)
    : {};
}

export function publicParkAmenityKind(value: unknown): PublicParkAssetKind | undefined {
  const label = cleanCountyValue(value)?.toLowerCase();
  return label ? PUBLIC_AMENITY_TYPES[label] : undefined;
}

function normalizeAssetFeatures(
  features: CountyArcFeature[],
  sourceKind: "bench" | "amenity",
): PublicParkAsset[] {
  const records: PublicParkAsset[] = [];
  const seen = new Set<string>();

  for (const feature of features) {
    const properties = propertiesOf(feature);
    // A non-null retirement date is explicit evidence the source retired it.
    if (arcGisDateToIso(properties.Retired)) continue;
    const id = countyObjectId(properties.OBJECTID ?? feature.id);
    const geometry = countyPointGeometry(feature.geometry);
    const kind =
      sourceKind === "bench" ? "bench" : publicParkAmenityKind(properties.Type1);
    if (!id || !geometry || !kind) continue;
    const compositeId = `${sourceKind}:${id}`;
    if (seen.has(compositeId)) continue;
    seen.add(compositeId);

    records.push({
      id: `fc-park-${sourceKind}-${id}`,
      kind,
      parkName: cleanCountyValue(properties.ParkName),
      geometry,
      sourceUpdatedAt: arcGisDateToIso(properties.last_edited_date),
      availability: "unknown",
      potable: kind === "drinking_water" ? true : null,
    });
  }

  return records;
}

/** Pure normalizer for tests and offline/cron transforms. */
export function normalizePublicParkAssets(
  benchFeatures: CountyArcFeature[],
  amenityFeatures: CountyArcFeature[],
): PublicParkAsset[] {
  return [
    ...normalizeAssetFeatures(benchFeatures, "bench"),
    ...normalizeAssetFeatures(amenityFeatures, "amenity"),
  ].sort((a, b) => {
    const parkCompare = (a.parkName ?? "").localeCompare(b.parkName ?? "");
    return parkCompare || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
  });
}

export async function getPublicCountyParkAssets(): Promise<
  CountyDataSnapshot<PublicParkAsset>
> {
  // Independent pulls: both are still bounded and fail closed. If either
  // layer is incomplete, returning a mixed snapshot would make coverage look
  // authoritative, so the combined dataset is unavailable.
  const [benches, amenities] = await Promise.all([
    fetchCountyArcGis({
      sourceId: FC_PARK_ASSETS_SOURCE.ledgerId,
      endpoint: BENCH_ENDPOINT,
      outFields: OUT_FIELDS,
      where: "Retired IS NULL",
      cacheSeconds: CACHE_SECONDS,
      cacheTag: "fc-park-benches-public",
      pageSize: 1_000,
    }),
    fetchCountyArcGis({
      sourceId: FC_PARK_ASSETS_SOURCE.ledgerId,
      endpoint: AMENITY_ENDPOINT,
      outFields: OUT_FIELDS,
      where: "Retired IS NULL",
      cacheSeconds: CACHE_SECONDS,
      cacheTag: "fc-park-amenities-public",
      pageSize: 1_000,
    }),
  ]);

  if (!benches.configured || !amenities.configured) {
    return countySnapshot(FC_PARK_ASSETS_SOURCE, benches, []);
  }
  if (!benches.ok || !amenities.ok) {
    const failed = !benches.ok ? benches : amenities;
    return countySnapshot(FC_PARK_ASSETS_SOURCE, failed, []);
  }

  const records = normalizePublicParkAssets(benches.features, amenities.features);
  return countySnapshot(
    FC_PARK_ASSETS_SOURCE,
    {
      ok: true,
      configured: true,
      features: [...benches.features, ...amenities.features],
      checkedAt:
        Date.parse(benches.checkedAt) >= Date.parse(amenities.checkedAt)
          ? benches.checkedAt
          : amenities.checkedAt,
      sourceResponseAt: benches.sourceResponseAt ?? amenities.sourceResponseAt,
    },
    records,
    newestIso(records.map((record) => record.sourceUpdatedAt)),
  );
}
