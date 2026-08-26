import type { OsmPlace } from "@/lib/integrations/overpass";
import type { Amenity } from "@/lib/loaders/amenities";
import type { ParkingPin } from "@/lib/map/parking";
import {
  EMPTY_FLOOD_CONTEXT_FC,
  EMPTY_ROAD_WORK_ZONE_FC,
  EMPTY_SNOW_ROUTE_FC,
  type CemeteryPin,
  type CivicPin,
  type EventPin,
  type FloodContextFC,
  type FoodTruckMapPin,
  type MapLineFC,
  type RoadWorkZoneFC,
  type SnowRouteFC,
} from "./types";

const EMPTY_LINE_FC: MapLineFC = {
  type: "FeatureCollection",
  features: [],
};

export const MAP_LAYER_GROUPS = [
  "context",
  "signals",
  "amenities",
  "events",
  "outdoors",
  "transit",
  "roads",
  "boundaries",
  "parking",
] as const;

export type MapLayerGroup = (typeof MAP_LAYER_GROUPS)[number];

export type MapLayerSourceHealth = {
  status: "current" | "partial" | "unavailable";
  /** Plain provider labels only. Never expose upstream error text. */
  unavailable: string[];
};

/**
 * Return the one group represented by a canonical public endpoint query.
 *
 * Provider-bearing URLs must have a finite cache-key space. Parsing URLSearchParams
 * alone would accept ignored nonce parameters, repeated keys, comma lists, and
 * percent-encoded aliases as distinct CDN URLs even though they run the same work.
 */
export function canonicalMapLayerGroupSearch(
  rawSearch: string,
): MapLayerGroup | null {
  for (const group of MAP_LAYER_GROUPS) {
    if (rawSearch === `?groups=${group}`) return group;
  }
  return null;
}

export function parseMapLayerGroups(raw: string | null): Set<MapLayerGroup> {
  const requested = raw
    ?.split(",")
    .map((group) => group.trim())
    .filter((group): group is MapLayerGroup =>
      (MAP_LAYER_GROUPS as readonly string[]).includes(group),
    );
  const groups = new Set<MapLayerGroup>(
    requested?.length ? requested : ["context"],
  );
  if (groups.has("amenities") || groups.has("parking")) groups.add("context");
  return groups;
}

export type BrowseMapSmartSignals = {
  conditionsStatus: "current" | "stale" | "unavailable";
  outdoorSafetyHold?: {
    kind: "weather" | "air-quality";
    reason: string;
  } | null;
  activeWeatherAlert: boolean;
  marketsOpenTodayCount: number;
  roadsTrendingLongerCount: number;
};

/**
 * Optional map context that is intentionally loaded after the core county
 * map and place index are usable. These layers are valuable once requested,
 * but none of them should hold the first map frame behind a live provider.
 */
export type DeferredBrowseLayers = {
  civic: CivicPin[];
  extraAmenities: OsmPlace[];
  amenities: Amenity[];
  trailLines: MapLineFC;
  transitLines: MapLineFC;
  municipalBoundaries: MapLineFC;
  cemeteries: CemeteryPin[];
  parking: ParkingPin[];
  weekEvents: EventPin[];
  foodTruckPins: FoodTruckMapPin[];
  roadWorkZones: RoadWorkZoneFC;
  floodContext: FloodContextFC;
  snowRoutes: SnowRouteFC;
  smartSignals: BrowseMapSmartSignals | null;
  /** Health travels with the data so an upstream miss cannot look like a
   * genuine zero-result map. Only explicitly requested groups are present. */
  sourceHealth: Partial<Record<MapLayerGroup, MapLayerSourceHealth>>;
};

export const EMPTY_DEFERRED_BROWSE_LAYERS: DeferredBrowseLayers = {
  civic: [],
  extraAmenities: [],
  amenities: [],
  trailLines: EMPTY_LINE_FC,
  transitLines: EMPTY_LINE_FC,
  municipalBoundaries: EMPTY_LINE_FC,
  cemeteries: [],
  parking: [],
  weekEvents: [],
  foodTruckPins: [],
  roadWorkZones: EMPTY_ROAD_WORK_ZONE_FC,
  floodContext: EMPTY_FLOOD_CONTEXT_FC,
  snowRoutes: EMPTY_SNOW_ROUTE_FC,
  smartSignals: null,
  sourceHealth: {},
};

/**
 * A summarized signal object can exist even when every live source behind it
 * is unavailable. Keep this predicate shared by the route and client so that
 * an all-zero unavailable summary is never mistaken for partial live data.
 */
export function mapLayerGroupHasVisibleData(
  group: MapLayerGroup,
  payload: DeferredBrowseLayers,
): boolean {
  switch (group) {
    case "context":
      return payload.amenities.length > 0 || payload.parking.length > 0;
    case "signals":
      return Boolean(
        payload.smartSignals &&
          (payload.smartSignals.conditionsStatus !== "unavailable" ||
            payload.smartSignals.activeWeatherAlert ||
            payload.smartSignals.marketsOpenTodayCount > 0 ||
            payload.smartSignals.roadsTrendingLongerCount > 0),
      );
    case "amenities":
      return payload.amenities.length > 0 || payload.extraAmenities.length > 0;
    case "events":
      return payload.weekEvents.length > 0;
    case "outdoors":
      return (
        payload.trailLines.features.length > 0 || payload.cemeteries.length > 0
      );
    case "transit":
      return payload.transitLines.features.length > 0;
    case "roads":
      return (
        payload.civic.length > 0 ||
        payload.roadWorkZones.features.length > 0 ||
        payload.floodContext.features.length > 0 ||
        payload.snowRoutes.features.length > 0 ||
        mapLayerGroupHasVisibleData("signals", payload)
      );
    case "boundaries":
      return payload.municipalBoundaries.features.length > 0;
    case "parking":
      return payload.parking.length > 0;
  }
}

function isFeatureCollection(value: unknown): value is MapLineFC {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; features?: unknown };
  return candidate.type === "FeatureCollection" && Array.isArray(candidate.features);
}

function parseSourceHealth(
  value: unknown,
): Partial<Record<MapLayerGroup, MapLayerSourceHealth>> {
  if (!value || typeof value !== "object") return {};
  const health = value as Record<string, unknown>;
  const parsed: Partial<Record<MapLayerGroup, MapLayerSourceHealth>> = {};
  for (const group of MAP_LAYER_GROUPS) {
    const raw = health[group];
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as { status?: unknown; unavailable?: unknown };
    if (
      candidate.status !== "current" &&
      candidate.status !== "partial" &&
      candidate.status !== "unavailable"
    ) {
      continue;
    }
    parsed[group] = {
      status: candidate.status,
      unavailable: Array.isArray(candidate.unavailable)
        ? candidate.unavailable
            .filter((label): label is string => typeof label === "string")
            .map((label) => label.trim())
            .filter(Boolean)
            .slice(0, 8)
        : [],
    };
  }
  return parsed;
}

/**
 * The endpoint is same-origin, but a partial deploy or stale edge response
 * must not crash the map. Keep valid fields and fall back only the malformed
 * layer, matching the map's long-standing fail-soft contract.
 */
export function parseDeferredBrowseLayers(value: unknown): DeferredBrowseLayers {
  if (!value || typeof value !== "object") return EMPTY_DEFERRED_BROWSE_LAYERS;
  const candidate = value as Partial<DeferredBrowseLayers>;

  return {
    civic: Array.isArray(candidate.civic) ? candidate.civic : [],
    extraAmenities: Array.isArray(candidate.extraAmenities)
      ? candidate.extraAmenities
      : [],
    amenities: Array.isArray(candidate.amenities) ? candidate.amenities : [],
    trailLines: isFeatureCollection(candidate.trailLines)
      ? candidate.trailLines
      : EMPTY_LINE_FC,
    transitLines: isFeatureCollection(candidate.transitLines)
      ? candidate.transitLines
      : EMPTY_LINE_FC,
    municipalBoundaries: isFeatureCollection(candidate.municipalBoundaries)
      ? candidate.municipalBoundaries
      : EMPTY_LINE_FC,
    cemeteries: Array.isArray(candidate.cemeteries) ? candidate.cemeteries : [],
    parking: Array.isArray(candidate.parking) ? candidate.parking : [],
    weekEvents: Array.isArray(candidate.weekEvents) ? candidate.weekEvents : [],
    foodTruckPins: Array.isArray(candidate.foodTruckPins)
      ? candidate.foodTruckPins
      : [],
    roadWorkZones: isFeatureCollection(candidate.roadWorkZones)
      ? candidate.roadWorkZones
      : EMPTY_ROAD_WORK_ZONE_FC,
    floodContext: isFeatureCollection(candidate.floodContext)
      ? candidate.floodContext
      : EMPTY_FLOOD_CONTEXT_FC,
    snowRoutes: isFeatureCollection(candidate.snowRoutes)
      ? candidate.snowRoutes
      : EMPTY_SNOW_ROUTE_FC,
    smartSignals:
      candidate.smartSignals &&
      typeof candidate.smartSignals === "object" &&
      (candidate.smartSignals.conditionsStatus === "current" ||
        candidate.smartSignals.conditionsStatus === "stale" ||
        candidate.smartSignals.conditionsStatus === "unavailable")
        ? candidate.smartSignals
        : null,
    sourceHealth: parseSourceHealth(candidate.sourceHealth),
  };
}

/** Merge only the fields owned by one endpoint group. */
export function mergeDeferredBrowseLayerGroup(
  current: DeferredBrowseLayers,
  incoming: DeferredBrowseLayers,
  group: MapLayerGroup,
): DeferredBrowseLayers {
  const incomingHealth = incoming.sourceHealth[group];
  const sourceHealth = incomingHealth
    ? { ...current.sourceHealth, [group]: incoming.sourceHealth[group] }
    : current.sourceHealth;
  const degraded = incomingHealth?.status === "partial";
  const unavailable = incomingHealth?.status === "unavailable";

  // An unavailable retry carries fallback empties, not evidence that the last
  // known features disappeared. Keep the last useful group data and update
  // only its health label so the UI can be honest and retryable.
  if (unavailable) return { ...current, sourceHealth };

  const arrayIdentity = (value: unknown): string => {
    if (!value || typeof value !== "object") return String(value);
    const item = value as Record<string, unknown>;
    const id = item.id ?? item.slug ?? item.osm_id;
    if (typeof id === "string" || typeof id === "number") {
      return `id:${String(id)}`;
    }
    const lat = item.lat;
    const lng = item.lng;
    const label = item.label ?? item.name ?? item.title ?? "";
    if (
      (typeof lat === "number" || typeof lng === "number") &&
      typeof label === "string"
    ) {
      return `point:${String(item.kind ?? "")}:${label}:${String(lat)}:${String(lng)}`;
    }
    return JSON.stringify(value);
  };
  const mergeArrays = <T,>(prior: T[], next: T[]): T[] => {
    if (!degraded) return next;
    const seen = new Set(next.map(arrayIdentity));
    return [
      ...next,
      ...prior.filter((item) => {
        const identity = arrayIdentity(item);
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      }),
    ];
  };
  const mergeFeatures = <T extends { features: unknown[] }>(
    prior: T,
    next: T,
  ): T => {
    if (!degraded) return next;
    return {
      ...next,
      features: mergeArrays(prior.features, next.features),
    };
  };
  const mergeSignals = () => {
    if (!degraded) return incoming.smartSignals;
    return mapLayerGroupHasVisibleData("signals", incoming)
      ? incoming.smartSignals
      : current.smartSignals;
  };
  if (group === "context") {
    return {
      ...current,
      amenities: mergeArrays(current.amenities, incoming.amenities),
      parking: mergeArrays(current.parking, incoming.parking),
      sourceHealth,
    };
  }
  if (group === "signals") {
    return { ...current, smartSignals: mergeSignals(), sourceHealth };
  }
  if (group === "amenities") {
    return {
      ...current,
      amenities: mergeArrays(current.amenities, incoming.amenities),
      extraAmenities: mergeArrays(
        current.extraAmenities,
        incoming.extraAmenities,
      ),
      sourceHealth,
    };
  }
  if (group === "events") {
    return {
      ...current,
      weekEvents: mergeArrays(current.weekEvents, incoming.weekEvents),
      sourceHealth,
    };
  }
  if (group === "outdoors") {
    return {
      ...current,
      trailLines: mergeFeatures(current.trailLines, incoming.trailLines),
      cemeteries: mergeArrays(current.cemeteries, incoming.cemeteries),
      sourceHealth,
    };
  }
  if (group === "transit") {
    return {
      ...current,
      transitLines: mergeFeatures(current.transitLines, incoming.transitLines),
      sourceHealth,
    };
  }
  if (group === "roads") {
    return {
      ...current,
      civic: mergeArrays(current.civic, incoming.civic),
      roadWorkZones: mergeFeatures(
        current.roadWorkZones,
        incoming.roadWorkZones,
      ),
      floodContext: mergeFeatures(
        current.floodContext,
        incoming.floodContext,
      ),
      snowRoutes: mergeFeatures(current.snowRoutes, incoming.snowRoutes),
      smartSignals: mergeSignals(),
      sourceHealth,
    };
  }
  if (group === "boundaries") {
    return {
      ...current,
      municipalBoundaries: mergeFeatures(
        current.municipalBoundaries,
        incoming.municipalBoundaries,
      ),
      sourceHealth,
    };
  }
  return {
    ...current,
    parking: mergeArrays(current.parking, incoming.parking),
    sourceHealth,
  };
}
