import type { MapPinPlace, SelectedOsm } from "./types";

type ClusterSource = "curated-places" | "osm-businesses" | "amenities";

export type MapClusterSelection = {
  source: ClusterSource;
  ids: string[];
};

export type MapClusterRow =
  | { kind: "place"; value: MapPinPlace }
  | { kind: "raw"; value: SelectedOsm };

export const CLUSTER_HIT_SOURCES: Readonly<Record<string, ClusterSource | undefined>> = {
  "curated-cluster-hit": "curated-places",
  "osm-cluster-hit": "osm-businesses",
  "amenity-cluster-hit": "amenities",
};

export const PLACE_HIT_LAYER_IDS = new Set([
  ...Object.keys(CLUSTER_HIT_SOURCES),
  "curated-hit",
  "osm-hit",
  "amenity-hit",
]);

export function isMapClusterSelection(value: Record<string, unknown>): boolean {
  return (
    Object.values(CLUSTER_HIT_SOURCES).some((source) => value.source === source) &&
    Array.isArray(value.ids) &&
    value.ids.length > 0 &&
    value.ids.every((id) => typeof id === "string" && id.length > 0)
  );
}

export function rawSelectionFromFeature(feature: GeoJSON.Feature): SelectedOsm | null {
  const properties = feature.properties;
  if (feature.geometry.type !== "Point" || !properties) return null;
  const [lng, lat] = feature.geometry.coordinates;
  const props = properties as Record<string, string | undefined>;
  if (!props.osm_id || !props.name || !props.category) return null;
  return {
    _kind: "osm",
    osm_id: props.osm_id,
    name: props.name,
    category_slug: props.category,
    osm_tag: props.osm_tag ?? "",
    address: props.address,
    city: props.city,
    phone: props.phone,
    website: props.website,
    opening_hours: props.opening_hours,
    cuisine: props.cuisine,
    wheelchair: props.wheelchair === "yes" || props.wheelchair === "no" || props.wheelchair === "limited"
      ? props.wheelchair
      : undefined,
    outdoor_seating: props.outdoor_seating === "yes" || undefined,
    photo: props.photo || undefined,
    observed_at: props.observed_at || undefined,
    lng,
    lat,
  };
}
