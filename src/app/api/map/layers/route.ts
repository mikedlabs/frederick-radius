import { NextResponse } from "next/server";
import type { Amenity } from "@/lib/loaders/amenities";
import {
  allAmenities,
  dedupeAmenities,
} from "@/lib/loaders/amenities";
import { getFieldAmenities } from "@/lib/loaders/fieldAmenities";
import { getCommunityReports } from "@/lib/loaders/communityReports";
import { REPORT_CATEGORY_BY_KEY } from "@/lib/reports/categories";
import type { OsmPlace } from "@/lib/integrations/overpass";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { fetchMapillaryTrash } from "@/lib/integrations/mapillary";
import { getFrederickTrailShapes } from "@/lib/integrations/fcTrails";
import { getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";
import { getMunicipalBoundaries } from "@/lib/integrations/fcGis";
import { getFrederickWaterSites } from "@/lib/integrations/usgsWater";
import {
  evDetailLine,
  getEvChargingStations,
} from "@/lib/integrations/evCharging";
import { getHistoricCemeteries } from "@/lib/integrations/fcCemeteries";
import { occupancyByGarageSlug } from "@/lib/integrations/parking-live";
import { PARKING_GARAGES } from "@/data/parking-garages";
import type { ParkingPin } from "@/lib/map/parking";
import { loadTodayEventSnapshot } from "@/lib/loaders/todayEventSnapshot";
import { eventPinFromEvent } from "@/lib/map/eventPin";
import { isUtilityEvent } from "@/lib/event-kind";
import { hasPhysicalAttendance } from "@/lib/events/attendance";
import type {
  CivicPin,
  EventPin,
  FloodContextFC,
  SnowRouteFC,
} from "@/components/map/types";
import { getCurrentSituationSnapshot } from "@/lib/live/currentSituation";
import {
  selectMapRoadPins,
  type CurrentSituationSnapshot,
} from "@/lib/live/currentSituationModel";
import { getRoadIntelligenceSnapshot } from "@/lib/live/roadIntelligence";
import {
  selectRoadWorkZoneFeatureCollection,
  type RoadIntelligenceSnapshot,
} from "@/lib/live/roadIntelligenceModel";
import { alertPriority } from "@/lib/alert-priority";
import { outdoorSafetyHold } from "@/lib/weather-safety";
import { marketsOpenToday } from "@/lib/markets-today";
import { getPublicCountyParkAssets } from "@/lib/integrations/fcParkAssetsPublic";
import { countyParkAssetAmenity } from "@/lib/loaders/countyParkAmenities";
import { getCountyFloodContext } from "@/lib/integrations/fcFloodRisk";
import {
  FC_SNOW_COMMAND_SOURCE,
  getCountySnowRoutes,
} from "@/lib/integrations/fcSnowCommand";
import { mapPinPlaces } from "@/lib/map/placePins";
import { withDeadlineFallback } from "@/lib/promise-deadline";
import {
  canonicalMapLayerGroupSearch,
  EMPTY_DEFERRED_BROWSE_LAYERS,
  parseMapLayerGroups,
  type DeferredBrowseLayers,
  type MapLayerGroup,
} from "@/components/map/deferredBrowseLayers";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};
const MAP_LAYER_RATE_LIMIT = 60;
const MAP_LAYER_RATE_WINDOW_SECONDS = 60;

/**
 * Optional browse-map context, split by intent. A plain request returns only
 * committed local context. Provider-backed groups run only for an explicit
 * deep link or an in-map control that needs them.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  if (requestUrl.search === "") {
    requestUrl.search = "?groups=context";
    return NextResponse.redirect(requestUrl, {
      status: 307,
      headers: NO_STORE_HEADERS,
    });
  }

  // This route can fan out to provider-backed context. Keep its CDN key space
  // finite before any loader runs: ignored parameters and alternate encodings
  // are rejected instead of buying a fresh upstream request.
  const canonicalGroup = canonicalMapLayerGroupSearch(requestUrl.search);
  if (!canonicalGroup) {
    return NextResponse.json(
      { error: "invalid-map-layer-request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "forbidden-origin" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }
  if (
    await isRateLimited(
      request,
      "map-layers",
      MAP_LAYER_RATE_LIMIT,
      MAP_LAYER_RATE_WINDOW_SECONDS,
    )
  ) {
    return NextResponse.json(
      { error: "rate-limited" },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": String(MAP_LAYER_RATE_WINDOW_SECONDS),
        },
      },
    );
  }

  const now = new Date();
  const groups = parseMapLayerGroups(canonicalGroup);
  const wants = (group: MapLayerGroup) => groups.has(group);
  const needsPlaces = wants("context") || wants("amenities");
  const allPlaces = needsPlaces ? mapPinPlaces(now) : [];

  const [
    situationSnapshot,
    roadIntelligence,
    marketsToday,
    countyParkAssets,
    countyFloodContext,
    countySnowRoutes,
    fixit,
    mapillaryTrash,
    trailLines,
    transitLines,
    municipalBoundaries,
    waterSites,
    evStations,
    cemeteries,
    fieldAmenities,
    communityReports,
    parkingOccupancy,
    eventSnapshot,
  ] = await Promise.all([
    wants("roads")
      ? withDeadlineFallback<CurrentSituationSnapshot | null>(
          getCurrentSituationSnapshot(),
          4_500,
          null,
        )
      : Promise.resolve(null),
    wants("roads")
      ? withDeadlineFallback<RoadIntelligenceSnapshot | null>(
          getRoadIntelligenceSnapshot(),
          4_500,
          null,
        )
      : Promise.resolve(null),
    wants("roads")
      ? withDeadlineFallback(marketsOpenToday(now), 4_500, [])
      : Promise.resolve([]),
    wants("amenities")
      ? withDeadlineFallback(getPublicCountyParkAssets(), 4_500, null)
      : Promise.resolve(null),
    wants("roads")
      ? withDeadlineFallback(getCountyFloodContext(), 4_500, null)
      : Promise.resolve(null),
    wants("roads")
      ? withDeadlineFallback(getCountySnowRoutes(now), 4_500, null)
      : Promise.resolve(null),
    wants("roads")
      ? withDeadlineFallback(getFixItIssues(30), 4_500, [])
      : Promise.resolve([]),
    wants("amenities")
      ? withDeadlineFallback(fetchMapillaryTrash(), 3_000, [])
      : Promise.resolve([]),
    wants("outdoors")
      ? withDeadlineFallback(getFrederickTrailShapes(), 4_000, EMPTY_FC)
      : Promise.resolve(EMPTY_FC),
    wants("transit")
      ? withDeadlineFallback(
          getFrederickTransitRouteShapes(),
          4_000,
          EMPTY_FC,
        )
      : Promise.resolve(EMPTY_FC),
    wants("boundaries")
      ? withDeadlineFallback(getMunicipalBoundaries(), 3_000, EMPTY_FC)
      : Promise.resolve(EMPTY_FC),
    wants("amenities")
      ? withDeadlineFallback(getFrederickWaterSites(), 3_000, [])
      : Promise.resolve([]),
    wants("amenities")
      ? withDeadlineFallback(getEvChargingStations(), 3_500, [])
      : Promise.resolve([]),
    wants("outdoors")
      ? withDeadlineFallback(getHistoricCemeteries(), 3_000, [])
      : Promise.resolve([]),
    wants("amenities")
      ? withDeadlineFallback(getFieldAmenities(), 3_000, [])
      : Promise.resolve([]),
    wants("amenities")
      ? withDeadlineFallback(getCommunityReports(), 3_000, [])
      : Promise.resolve([]),
    wants("parking")
      ? withDeadlineFallback(occupancyByGarageSlug(), 3_000, new Map())
      : Promise.resolve(new Map()),
    wants("events")
      ? withDeadlineFallback(loadTodayEventSnapshot(now), 1_200, null)
      : Promise.resolve(null),
  ]);

  const incidents = situationSnapshot
    ? selectMapRoadPins(situationSnapshot).official
    : [];
  const civic: CivicPin[] = wants("roads")
    ? [
        ...incidents
          .filter(
            (incident) =>
              Number.isFinite(incident.lat) && Number.isFinite(incident.lng),
          )
          .map((incident) => ({
            kind: "traffic" as const,
            lng: incident.lng,
            lat: incident.lat,
            label: `${incident.road}: ${incident.type}`,
          })),
        ...fixit
          .filter(
            (issue) => Number.isFinite(issue.lat) && Number.isFinite(issue.lng),
          )
          .map((issue) => ({
            kind: "issue" as const,
            lng: issue.lng,
            lat: issue.lat,
            label: issue.summary,
          })),
      ]
    : [];

  const riverGaugeAmenities: Amenity[] = waterSites.map((site) => ({
    id: `usgs:${site.id}`,
    kind: "river_gauge" as const,
    name: site.river ? `${site.river} gauge` : "USGS gauge",
    detail: site.name,
    municipality: site.municipality,
    lng: site.lng,
    lat: site.lat,
  }));
  const evChargingAmenities: Amenity[] = evStations.map((station) => ({
    id: `mdev:${station.id}`,
    kind: "ev_charging" as const,
    name: station.name,
    detail: evDetailLine(station) || undefined,
    municipality: station.municipality,
    lng: station.lng,
    lat: station.lat,
  }));
  const baseAmenities = evStations.length
    ? allAmenities().filter((amenity) => amenity.kind !== "ev_charging")
    : allAmenities();
  const countyAmenities =
    countyParkAssets?.availability === "available"
      ? countyParkAssets.records
          .map(countyParkAssetAmenity)
          .filter((asset): asset is Amenity => asset !== null)
      : [];
  const amenities = needsPlaces
    ? dedupeAmenities(
        [
          ...baseAmenities,
          ...countyAmenities,
          ...evChargingAmenities,
          ...riverGaugeAmenities,
          ...fieldAmenities,
        ],
        allPlaces.map((place) => ({
          name: place.name,
          category: place.category,
          geom: place.geom,
          subcategories: place.subcategories,
          primary_type: place.primary_type,
          short_blurb: place.short_blurb,
        })),
      )
    : [];

  const floodContext: FloodContextFC =
    countyFloodContext?.availability === "available"
      ? {
          type: "FeatureCollection",
          features: countyFloodContext.records.map((record) => ({
            type: "Feature" as const,
            id: record.id,
            geometry: record.geometry,
            properties: {
              id: record.id,
              kind: record.kind,
              title:
                record.kind === "mapped_high_water_area"
                  ? "Known high-water area"
                  : record.kind === "warning_sign"
                    ? "Flood warning sign"
                    : "Past water-rescue location",
              creek: record.creek,
              currentStatus: "Not a live flooding report" as const,
              sourceUrl: record.sourceUrl,
            },
          })),
        }
      : { type: "FeatureCollection", features: [] };
  const snowRoutes: SnowRouteFC =
    countySnowRoutes?.availability === "available"
      ? {
          type: "FeatureCollection",
          features: countySnowRoutes.records
            .filter((record) => record.freshness === "current")
            .map((record) => ({
              type: "Feature" as const,
              id: record.id,
              geometry: record.geometry,
              properties: {
                id: record.id,
                district: record.district,
                reportedStatus: record.reportedStatus,
                observedAt: record.observedAt,
                roadSafety: record.roadSafety,
                sourceUrl: FC_SNOW_COMMAND_SOURCE.sourceUrl,
              },
            })),
        }
      : { type: "FeatureCollection", features: [] };

  const reportsAsOsm: OsmPlace[] = communityReports.map((report) => {
    const definition = REPORT_CATEGORY_BY_KEY[report.category];
    const subtype = definition?.subtypes.find(
      (item) => item.key === report.subtype,
    );
    return {
      osm_id: report.id,
      name:
        report.title?.trim() ||
        subtype?.label ||
        definition?.label ||
        "Report",
      category_slug: `report-${report.category}`,
      osm_tag: report.subtype ?? "",
      address: report.note ?? "",
      lng: report.lng,
      lat: report.lat,
      photo: report.photo,
      observed_at: report.createdAt,
    };
  });

  const weekHorizonMs = now.getTime() + 7 * 24 * 3_600_000;
  const weekEvents: EventPin[] = [];
  for (const event of eventSnapshot?.publicEvents ?? []) {
    if (isUtilityEvent(event)) continue;
    if (!hasPhysicalAttendance(event)) continue;
    if (
      !Number.isFinite(event.geom?.lng) ||
      !Number.isFinite(event.geom?.lat)
    ) {
      continue;
    }
    const startsAtMs = Date.parse(event.starts_at);
    if (!Number.isFinite(startsAtMs) || startsAtMs > weekHorizonMs) continue;
    const endsAtMs = event.ends_at ? Date.parse(event.ends_at) : startsAtMs;
    if (Math.max(startsAtMs, endsAtMs) < now.getTime() - 300_000) continue;
    weekEvents.push(eventPinFromEvent(event, now));
    if (weekEvents.length >= 400) break;
  }

  const parking: ParkingPin[] = needsPlaces
    ? PARKING_GARAGES.filter((garage) => garage.geom).map((garage) => {
        const occupancy = parkingOccupancy.get(garage.slug);
        return {
          slug: garage.slug,
          name: garage.name,
          address: garage.address,
          lng: garage.geom!.lng,
          lat: garage.geom!.lat,
          rate: garage.hourly_rate,
          available: occupancy?.available ?? null,
          percentFull: occupancy?.percentFull ?? null,
          isClosed: occupancy?.isClosed ?? false,
          isFull: occupancy?.isFull ?? false,
          isFilling: occupancy?.isFilling ?? false,
          updated: occupancy?.updated ?? null,
        };
      })
    : [];

  const mapSafetyHold = situationSnapshot
    ? outdoorSafetyHold(
        situationSnapshot.sources.weather.data,
        situationSnapshot.sources.air.data,
        now,
      )
    : null;
  const conditionSources = situationSnapshot
    ? [situationSnapshot.sources.weather, situationSnapshot.sources.air]
    : [];
  const conditionsStatus: "current" | "stale" | "unavailable" =
    conditionSources.length === 2 &&
    conditionSources.every(
      (source) =>
        source.availability === "available" && source.freshness === "fresh",
    )
      ? "current"
      : conditionSources.some((source) => source.availability === "available")
        ? "stale"
        : "unavailable";

  const payload: DeferredBrowseLayers = {
    ...EMPTY_DEFERRED_BROWSE_LAYERS,
    civic,
    extraAmenities: wants("amenities")
      ? [...mapillaryTrash, ...reportsAsOsm]
      : [],
    amenities,
    trailLines,
    transitLines,
    municipalBoundaries,
    cemeteries,
    parking,
    weekEvents,
    roadWorkZones: roadIntelligence
      ? selectRoadWorkZoneFeatureCollection(roadIntelligence)
      : { type: "FeatureCollection", features: [] },
    floodContext,
    snowRoutes,
    smartSignals: wants("roads")
      ? {
          conditionsStatus,
          outdoorSafetyHold:
            mapSafetyHold && mapSafetyHold.kind !== "unavailable"
              ? {
                  kind:
                    mapSafetyHold.kind === "nws" ? "weather" : "air-quality",
                  reason: mapSafetyHold.reason,
                }
              : null,
          activeWeatherAlert: (
            situationSnapshot?.sources.weather.data ?? []
          ).some((alert) => alertPriority(alert) <= 2),
          marketsOpenTodayCount: marketsToday.length,
          roadsTrendingLongerCount: (
            roadIntelligence?.sources.travelTimes.data ?? []
          ).filter((segment) => segment.trend === "longer").length,
        }
      : null,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
      "X-Radius-Map-Groups": [...groups].sort().join(","),
    },
  });
}
