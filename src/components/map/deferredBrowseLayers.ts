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
};

function isFeatureCollection(value: unknown): value is MapLineFC {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; features?: unknown };
  return candidate.type === "FeatureCollection" && Array.isArray(candidate.features);
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
  };
}

/** Merge only the fields owned by one endpoint group. */
export function mergeDeferredBrowseLayerGroup(
  current: DeferredBrowseLayers,
  incoming: DeferredBrowseLayers,
  group: MapLayerGroup,
): DeferredBrowseLayers {
  if (group === "context") {
    return {
      ...current,
      amenities: incoming.amenities,
      parking: incoming.parking,
    };
  }
  if (group === "signals") {
    return { ...current, smartSignals: incoming.smartSignals };
  }
  if (group === "amenities") {
    return {
      ...current,
      amenities: incoming.amenities,
      extraAmenities: incoming.extraAmenities,
    };
  }
  if (group === "events") {
    return { ...current, weekEvents: incoming.weekEvents };
  }
  if (group === "outdoors") {
    return {
      ...current,
      trailLines: incoming.trailLines,
      cemeteries: incoming.cemeteries,
    };
  }
  if (group === "transit") {
    return { ...current, transitLines: incoming.transitLines };
  }
  if (group === "roads") {
    return {
      ...current,
      civic: incoming.civic,
      roadWorkZones: incoming.roadWorkZones,
      floodContext: incoming.floodContext,
      snowRoutes: incoming.snowRoutes,
      smartSignals: incoming.smartSignals,
    };
  }
  if (group === "boundaries") {
    return { ...current, municipalBoundaries: incoming.municipalBoundaries };
  }
  return { ...current, parking: incoming.parking };
}
