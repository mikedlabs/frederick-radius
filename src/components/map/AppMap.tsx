"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Map, {
  Popup,
  Marker,
  NavigationControl,
  GeolocateControl,
  AttributionControl,
  Source,
  Layer,
  type MapRef,
  type MapMouseEvent,
} from "react-map-gl/mapbox";
// (GeolocateControl stays imported for DOCK-LESS embeds only — on /map
// browse the dock's Where pane is locate's one home.)
import type {
  GeoJSONSource,
  StyleSpecification,
} from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { useMode } from "@/hooks/useMode";
import { defaultsFor } from "@/lib/mode-defaults";
import { scopeClosures } from "@/lib/mode-scope";
import { ACCENTS, CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITIES } from "@/data/municipalities";
import { getHomeMuni } from "@/lib/personalize";
import Link from "next/link";
import dynamic from "next/dynamic";
import { municipalCivicFor, civicContacts } from "@/lib/loaders/municipalCivic";
import type { OsmPlace } from "@/lib/integrations/overpass";
import { usePlaceSheet } from "@/components/place/PlaceSheetProvider";
import CategoryIcon from "@/components/place/CategoryIcon";
import { useFollowedSlugs } from "@/hooks/useFollows";
import { useRouter, useSearchParams } from "next/navigation";
import type { SearchResult } from "@/lib/search/index";
import {
  getScope,
  parseScope,
  setScope,
  subscribeScopeChange,
  SCOPE_PARAM,
  type Scope,
} from "@/lib/scope";
// TYPE ONLY: importing the loader at runtime drags the ~12MB
// places-enrichment.json into the client bundle (a 13MB chunk) and
// the map never loads. Places arrive already decorated from the
// server page; the client only attaches a viewport distance.
import type { PlaceCardData } from "@/lib/loaders/places";
// TYPE ONLY: the amenities loader only reads the small static
// amenities.json, but to keep this component strictly loader-free
// (the rule that closed the 12MB bundle leak) the points arrive as a
// server prop and only the Amenity type is imported (erased at build).
import type { Amenity } from "@/lib/loaders/amenities";
import { haversineMeters, type LngLat } from "@/lib/geo";
import {
  GEOLOCATION_CHANGE_EVENT,
  readCachedGeoPosition,
  readCachedPosition,
  useGeolocation,
} from "@/hooks/useGeolocation";
import { sizedImage } from "@/lib/format/img";
// THE one duplicate rule (pure, no data imports — bundle-safe). The
// map's curated-vs-OSM de-dupe now uses the exact same contract as
// the canonical loader, so "the same thing twice" is closed by one
// rule on every surface instead of a weaker map-only heuristic.
import { track } from "@/lib/track";
import { haptic } from "@/lib/haptics";
import { BRAND } from "@/lib/brand";
import { applyFrederickPalette, installRelief } from "./applyFrederickPalette";
import { installCountySpotlight } from "./countySpotlight";
// Baked style JSON — the palette pre-applied at build time. Only used when
// MAP_BAKED_STYLE is on; the import is a small (~36KB) static JSON so it's
// cheap to include even when the flag is off (tree-shakers keep it out of the
// runtime path since mapStyle only references it behind the flag).
import BAKED_STYLE from "./frederick-style.json";
import { markMapOnLoad, markMapIdleOnce } from "./mapPerf";
import { readMapLayerPrefs } from "./mapLayerPrefs";
import {
  nearestMapUtilities,
  nearestMapUtilityPoint,
  type NearbyUtilityPoint,
} from "./mapNearby";
import {
  curatedClusterColorExpression,
  curatedClusterLabelExpression,
  curatedClusterProperties,
  dominantClusterFamilyLabel,
  installCategoryMarkers,
} from "./categoryMarkers";
import { exposeMarkerChild } from "./markerA11y";
import BottomDrawer from "@/components/ui/BottomDrawer";
import StopArrivalsPopup, {
  type SelectedStop,
} from "@/components/transit/StopArrivalsPopup";
import { clampLocationAccuracy } from "./mapLocationAccuracy";
import { mapPaintTransitionDuration } from "./mapVisualState";
import { curatedPlacesForMapSource } from "./mapSourceFilter";

// The readable result face is loaded only when WebGL fails. Keeping it out of
// the healthy-map path preserves the interactive map payload while ensuring a
// graphics failure never turns the page into a generic dead-end link.
const MapList = dynamic(() => import("./MapList"), { ssr: false });

// Aerial archive + camera/environment helpers were extracted to focused
// siblings (#77): mapAerialArchive.ts and mapCameraHelpers.ts.
import {
  AERIAL_PHOTOS,
  AERIAL_SEASONS,
  AERIAL_SEASON_COUNTS,
  SEASON_HEX,
  type AerialPhoto,
  type AerialSeason,
} from "./mapAerialArchive";
import {
  AERIAL_GEOJSON,
  MUNI_LABELS_GEOJSON,
  activeAmenityCategorySlugs,
  buildAccuracyGeoJson,
  buildAmenityGeoJson,
  buildAmenitySelectionPoints,
  buildCemeteryGeoJson,
  buildCivicGeoJson,
  buildCuratedGeoJson,
  buildDotGeoJson,
  buildEventScrubTimes,
  buildFilteredOsmGeoJson,
  buildPlaceDupeIndex,
  buildRingGeoJson,
  buildRouteGeoJson,
  buildSelectedGeoJson,
  buildUtilityPoints,
  makeOsmDupeCheck,
} from "./mapGeoJsonSources";
import { useLiveFoodTrucks } from "./useLiveFoodTrucks";
import { useMapLayerToggles } from "./useMapLayerToggles";
import { useOsmPlaces } from "./useOsmPlaces";
import { useWalkRoute } from "./useWalkRoute";
import {
  SHORT_LANDSCAPE_MAX_BOUNDS,
  countyFitPadding,
  fitNearbyRadius,
  hasWebGL,
  isCountyOverview,
  prefersReducedMotion,
  scrubInstant,
  type ResultViewportMap,
} from "./mapCameraHelpers";

// Curated-place semantic zoom has two deliberately separate profiles:
// - the main dock map clusters the full county catalog until street zoom;
// - compact subject maps keep their tighter, amber cluster treatment.
// Other embedded maps remain unclustered so a small, already-scoped set never
// gets collapsed unnecessarily.
const COUNTY_CURATED_CLUSTER_RADIUS = 58;
// Downtown remains aggregated until the user reaches a true street-reading
// scale. Releasing the full county catalog earlier created a confetti field
// before individual storefronts could be understood.
const COUNTY_CURATED_CLUSTER_MAX_ZOOM = 15;
const COMPACT_CURATED_CLUSTER_RADIUS = 46;
const COMPACT_CURATED_CLUSTER_MAX_ZOOM = 12;
const CURATED_CLUSTER_PROPERTIES = curatedClusterProperties();
const CURATED_CLUSTER_COLOR = curatedClusterColorExpression();
const CURATED_CLUSTER_LABEL = curatedClusterLabelExpression();

// Types, constants, and popup components are kept in focused siblings so this
// file can own map state, effects, and layout.
import {
  EMPTY_FLOOD_CONTEXT_FC,
  EMPTY_LINE_FC,
  EMPTY_ROAD_WORK_ZONE_FC,
  EMPTY_SNOW_ROUTE_FC,
  type BrowseDockInfo,
  type CemeteryPin,
  type CivicPin,
  type EventPin,
  type FloodContextFC,
  type FoodTruckMapPin,
  type MapLineFC,
  type MapPinPlace,
  type MarcStationPin,
  type RoadWorkZoneFC,
  type Selected,
  type SnowRouteFC,
  type TransitStopPin,
} from "./types";
import {
  confidentLocalMapPlaceResult,
  immediateMapPlaceResults,
  reconcileMapSearchResults,
} from "./mapLocalPlaceSearch";
import { placesWithinReach } from "./mapNearbyScope";
import {
  AMENITY_GROUPS,
  AMENITY_KIND_TO_CAT,
  CAM_EASE,
  FREDERICK,
  FREDERICK_COUNTY_BOUNDS,
  FREDERICK_MAX_BOUNDS,
  FREDERICK_MIN_ZOOM,
  FREDERICK_MAX_ZOOM,
  isInFrederickCounty,
  MAP_BAKED_STYLE,
  RADIUS_M,
  STYLE_URL,
  isAmenity,
  smoothFocus,
} from "./constants";
import MapOverlays from "./MapOverlays";
import LiveBuses from "./LiveBuses";
import { createLiveLayerCloserRegistry, type LiveLayerGate } from "./liveLayerGate";
import LiveMarcTrains from "./LiveMarcTrains";
import WeatherRadar from "./WeatherRadar";
import LightningDensity from "./LightningDensity";
import LiveIncidents from "./LiveIncidents";
import LiveRotorcraft, {
  type RotorcraftLayerStatus,
} from "./LiveRotorcraft";
import TrafficCameras from "./TrafficCameras";
import MapboxTraffic from "./MapboxTraffic";
import RoadWorkZones from "./RoadWorkZones";
import FloodContext from "./FloodContext";
import SnowRoutes from "./SnowRoutes";
import {
  parseLayersParam,
  serializeLayers,
  type OverlayKey,
} from "@/lib/overlays";
import {
  replaceMapUrl,
  replaceMapUrlSilently,
} from "@/lib/map-url-state";
import {
  EventPopup,
  OsmPopup,
  PlacePopup,
} from "./popups";
import AppMapDeck from "./AppMapDeck";
import MapDock from "./MapDock";
import MapEdgeTools from "./MapEdgeTools";
import type { MapEdgeOverlayId, MapEdgeOverlayState } from "./mapEdgeToolsModel";
import MapPeek from "./MapPeek";
import MapParkingPeek from "./MapParkingPeek";
import MapFoodTruckPeek from "./MapFoodTruckPeek";
import {
  MapAerialPeek,
  MapCemeteryPeek,
  MapEventPeek,
  MapMarcPeek,
  MapRawPeek,
  MapTownPeek,
} from "./MapEntityPeek";
import MapSpotPeek from "./MapSpotPeek";
import MapDiscoveryOverlay from "./MapDiscoveryOverlay";
import {
  liveLayerHealth,
  type LiveLayerHealth,
} from "@/lib/live-layer-health";
import { directionsHref } from "@/lib/map/directionsHref";
import MapDiscoveryPeek from "./MapDiscoveryPeek";
import { buildMapDiscoveries, type MapDiscovery } from "./mapDiscoveries";
import { parkingTone, PARKING_TONE_STYLE, type ParkingPin } from "@/lib/map/parking";
import {
  applyMapboxStandardPreviewConfig,
  isMapboxStandardPreviewEnabled,
  mapStyleWithStandardPreview,
} from "./mapboxStandardPreview";
import TimeScrubber from "./TimeScrubber";
import { ArrowRight, ChevronRight, Shrink, Truck, X } from "lucide-react";
import { withinScrubWindow } from "@/lib/map/scrubTime";
import { easternDayKey } from "@/lib/tz";
import { getOpenStatus, isOpenNow } from "@/lib/hours";
import { groupMapEvents, type MapEventGroup } from "./mapContent";
import { resolveMapLocationSeed } from "./mapLocationSeed";
import type { LiveIncidentSignal } from "@/lib/live/incidentSnapshot";
import { buildMapSpotContext } from "./mapSpotContext";
import { encodePolyline } from "./polyline";
import { rememberMapSelectionOpener } from "./mapSelectionFocus";
import {
  mapCameraParam,
  mapResultCountAnnouncement,
  resultViewportChanged,
  type MapResultViewport,
  type MapViewportBounds,
} from "./mapViewportCommit";

type MapSpotSelection = LngLat & {
  label?: string;
  temporary?: boolean;
  attribution?: string;
};

type CivicTownSelection = {
  name: string;
  slug: string;
  lng: number;
  lat: number;
};

type MapSelectionRequest =
  | { kind: "place"; value: MapPinPlace }
  | { kind: "raw"; value: NonNullable<Selected>; contextLabel?: string }
  | { kind: "event"; value: EventPin }
  | { kind: "event-group"; value: MapEventGroup }
  | { kind: "town"; value: CivicTownSelection }
  | { kind: "transit"; value: SelectedStop }
  | { kind: "marc"; value: string }
  | { kind: "aerial"; value: AerialPhoto }
  | { kind: "cemetery"; value: CemeteryPin }
  | { kind: "parking"; value: ParkingPin }
  | { kind: "food-truck"; value: FoodTruckMapPin }
  | { kind: "discovery"; value: MapDiscovery }
  | { kind: "spot"; value: MapSpotSelection };

type Props = {
  /** Pin-field records (MapPinPlace). Full PlaceCardData satisfies the type,
   *  so SavedList/radius callers pass full records; /map browse passes the
   *  slim set and the sheet hydrates the full card on tap (openPlaceSheet). */
  places: MapPinPlace[];
  osmPlaces?: OsmPlace[];
  height?: string;
  /** Full-bleed layout: drop the rounded border, fill the parent. The
   *  /map route uses this so the map IS the page, not a card on it. */
  fullBleed?: boolean;
  initialCenter?: [number, number];
  initialZoom?: number;
  /** Fit this extent on first paint. Used by the clean /map entry so the
   *  entire county is visible on every viewport, including narrow phones. */
  initialBounds?: [[number, number], [number, number]];
  /** Override the browse-dock-aware fit padding for a smaller embedded map. */
  initialBoundsPadding?:
    | number
    | { top: number; right: number; bottom: number; left: number };
  /** Camera constraints can be looser on the full browse surface than on
   * embedded maps, while coordinate validation remains county-tight. */
  cameraMinZoom?: number;
  cameraMaxBounds?: [[number, number], [number, number]];
  /** Single-subject county overview. Its small place set is clustered at wide
   * zoom, all resulting marks are tappable, and location furniture stays off. */
  compactSubjectMap?: boolean;
  /** Fires when a result area is committed with curated places inside it,
   *  nearest-to-origin first. Gesture-driven cameras wait for the explicit
   *  "Show results here" action; programmatic cameras commit automatically. */
  onPlacesInView?: (slugs: string[]) => void;
  /** Tap a result in the synced list → fly the map there and glow it.
   *  `n` is a nonce so re-tapping the same place re-triggers. */
  focus?: { slug: string; n: number } | null;
  /** Live civic points (traffic incidents, 311 reports) for the overlay. */
  civic?: CivicPin[];
  /** Server-fetched amenity points (Mapillary trash detections) merged
   *  into the amenity layer — the secret token stays server-side. */
  extraAmenities?: OsmPlace[];
  /** Curated civic amenities (restrooms, Wi-Fi, EV, bike parking,
   *  picnic, playgrounds — amenities.json, 442 pts). Server prop so
   *  this stays loader-free; always present, unlike the flaky live
   *  OSM amenity fetch. Folded into the same grouped Amenities tray. */
  amenities?: Amenity[];
  /** Server-fetched line geometry for toggleable overlays (#3). Plain
   *  GeoJSON FeatureCollections; default off, so the base map is
   *  unchanged unless the user opts in. */
  trailLines?: MapLineFC;
  /** Open the Trails line layer ON at first paint (no saved pref yet) —
   *  set by the /trails surface, whose whole job is the trail network.
   *  Everywhere else it stays off so the base map is unchanged. */
  trailsLayerDefault?: boolean;
  transitLines?: MapLineFC;
  /** County GIS municipal boundary polygons, rendered as a quiet
   *  always-on outline. Server-fetched (fcGis.getMunicipalBoundaries),
   *  empty FC when the county server is unreachable. */
  municipalBoundaries?: MapLineFC;
  /** County boundary polygon — the quiet always-on county edge (6.1),
   *  drawn under the place pins. Empty FC when unavailable. */
  countyBoundary?: MapLineFC;
  /** Historic cemeteries (county GIS heritage points). Opt-in via the
   *  Layers panel, OFF by default — a niche heritage layer, never part
   *  of the clean cold open. Empty when the county feed is unreachable
   *  (the toggle simply doesn't render). */
  cemeteries?: CemeteryPin[];
  /** Downtown parking garages (static metadata + live availability). The
   *  opt-in Parking layer, OFF by default — five garage markers tinted by
   *  live occupancy, honest about missing counts. Empty when there's no
   *  garage data (embeds). */
  parking?: ParkingPin[];
  /** Upcoming events as map pins — phase 1 differentiator vs Google /
   *  Apple Maps (they don't have local event ↔ venue joins). Already
   *  geo-deduped and scoped to "happening soon" server-side. */
  events?: EventPin[];
  /** Bus-stop dots + MARC stations for the Transit layer (phase 3).
   *  Stops are location+name only (no schedule data exists for them);
   *  MARC pins carry server-computed next trains as clock times. */
  transitStops?: TransitStopPin[];
  marcStations?: MarcStationPin[];
  /** Operator-confirmed, self-expiring truck locations. */
  foodTruckPins?: FoodTruckMapPin[];
  /** Official WZDx work-zone lines, grouped with the existing Traffic view. */
  roadWorkZones?: RoadWorkZoneFC;
  /** Known County high-water context. It never asserts a live flood. */
  floodContext?: FloodContextFC;
  /** Current County SnowCommand route-operation reports. */
  snowRoutes?: SnowRouteFC;
  /** Open centered on the user's last-known location when a fresh
   *  cached fix exists (no prompt) — set when arriving via a category
   *  so the map and its list read "from where you're standing." Falls
   *  back to `initialCenter` when there's no cached fix. */
  recenterToKnownLocation?: boolean;
  /** Pinpoint-first: when true (browse mode with no server-side intent
   *  filter) the map opens CLEAN — no curated pins until the user adds a
   *  category — instead of dumping all ~1,700. The control surface lets
   *  them compose what they want to see. */
  pinpointDefault?: boolean;
  /** Amenity-tray group keys to pre-activate (e.g. a /map?amenity=restroom
   *  deep-link from /amenities or /today). Opens the tray showing that layer
   *  on first paint instead of a clean map. */
  initialAmenityGroups?: string[];
  /** Browse-view state + counts for the map dock (/map browse only).
   *  When present the dock renders and the legacy floating controls
   *  (scrubber, aerial season chips, locate homes) stand down. */
  dock?: BrowseDockInfo;
  /** The slugs of places that MATCH the active place/open/deal filter. When
   *  one is on, the curated GeoJSON source contains only these slugs so its
   *  pins and cluster counts cannot imply unrelated results. Null/undefined
   *  means no place filter is active and preserves the full curated map. */
  activeSlugs?: string[] | null;
  /** Hide the generic search deck when an embedded map already has one
   *  explicit subject. Native locate and zoom controls remain available. */
  showSearchControls?: boolean;
  /** The first usable map frame painted, or a stable fallback took over. */
  onVisualReady?: () => void;
};

export default function AppMap({
  places,
  osmPlaces: osmFromProps,
  height = "78vh",
  fullBleed = false,
  initialCenter = FREDERICK,
  initialZoom = 14,
  initialBounds,
  initialBoundsPadding,
  cameraMinZoom = FREDERICK_MIN_ZOOM,
  cameraMaxBounds = FREDERICK_MAX_BOUNDS,
  compactSubjectMap = false,
  recenterToKnownLocation = false,
  pinpointDefault = false,
  onPlacesInView,
  focus,
  civic = [],
  extraAmenities = [],
  amenities = [],
  trailLines = EMPTY_LINE_FC,
  trailsLayerDefault = false,
  transitLines = EMPTY_LINE_FC,
  municipalBoundaries = EMPTY_LINE_FC,
  countyBoundary = EMPTY_LINE_FC,
  cemeteries = [],
  parking = [],
  transitStops = [],
  marcStations = [],
  foodTruckPins = [],
  roadWorkZones = EMPTY_ROAD_WORK_ZONE_FC,
  floodContext = EMPTY_FLOOD_CONTEXT_FC,
  snowRoutes = EMPTY_SNOW_ROUTE_FC,
  events = [],
  initialAmenityGroups,
  dock,
  activeSlugs = null,
  showSearchControls = true,
  onVisualReady,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const isBrowseMap = Boolean(dock);
  const routeSearchParams = useSearchParams();
  const routeSearch = routeSearchParams.toString();
  const routeScopeParam = routeSearchParams.get(SCOPE_PARAM);
  const [resultScope, setResultScope] = useState<Scope>(() =>
    parseScope(routeScopeParam) ?? "county",
  );
  useEffect(() => {
    setResultScope(parseScope(routeScopeParam) ?? "county");
  }, [routeScopeParam]);
  useEffect(
    () =>
      subscribeScopeChange((nextScope) =>
        setResultScope(nextScope ?? "county"),
      ),
    [],
  );
  const standardPreview = isMapboxStandardPreviewEnabled(routeSearch);
  const attachMapRef = useCallback((instance: MapRef | null) => {
    mapRef.current = instance;
    if (instance) installCategoryMarkers(instance.getMap());
  }, []);
  // Rotation may refit an untouched county overview, but it must never yank a
  // camera the user deliberately panned, zoomed, searched, or focused.
  const cameraIntentRef = useRef(false);
  // A fresh cached fix always powers ranking and distance labels, but it only
  // moves the initial camera when the route explicitly opts in. Keeping those
  // decisions separate makes county browse local without changing its frame.
  const [locationSeed] = useState(() =>
    resolveMapLocationSeed(readCachedPosition(), recenterToKnownLocation),
  );
  const effectiveCenter: [number, number] = locationSeed.camera
    ? [locationSeed.camera.lng, locationSeed.camera.lat]
    : initialCenter;
  const searchFallbackOriginRef = useRef<LngLat>({
    lng: effectiveCenter[0],
    lat: effectiveCenter[1],
  });
  // Stable first-paint camera input. Measuring DOM here on every React render
  // caused avoidable layout reads; explicit Whole County refits still measure
  // the live dock through countyFitPadding().
  const initialCountyPadding = useMemo(
    () => initialBoundsPadding ?? countyFitPadding(false),
    [initialBoundsPadding],
  );
  const [shortLandscapeViewport, setShortLandscapeViewport] = useState(
    () => typeof window !== "undefined" && window.innerHeight < 520 && window.innerWidth > window.innerHeight,
  );
  const countyCuratedClusters = isBrowseMap && !compactSubjectMap;
  const curatedClusters = countyCuratedClusters || compactSubjectMap;
  const curatedClusterRadius = compactSubjectMap
    ? COMPACT_CURATED_CLUSTER_RADIUS
    : COUNTY_CURATED_CLUSTER_RADIUS;
  const curatedClusterMaxZoom = compactSubjectMap
    ? COMPACT_CURATED_CLUSTER_MAX_ZOOM
    : COUNTY_CURATED_CLUSTER_MAX_ZOOM;
  // Mobile already has pinch and double-tap zoom. The stock two-button zoom
  // stack put Zoom out in the exact same 44px box as the browse map's Locate
  // control. Dock-less embeds retain the stock controls; the full browse map
  // keeps them from lg upward.
  const [compactMapViewport, setCompactMapViewport] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 1024,
  );
  // Shareable / reload-safe camera: a `?c=lng,lat,zoom` param (written on
  // moveend below) reopens the map exactly where it was left. Keep it reactive
  // because Next may preserve this map while a detail route is open and reveal
  // it again for "Back to map." Malformed values fall through to the
  // mode/cached default. Mapbox clamps any out-of-region value to maxBounds,
  // so a crafted URL is harmless.
  const routeCameraParam = routeSearchParams.get("c");
  const urlCamera = useMemo(() => {
    const raw = routeCameraParam;
    if (!raw) return null;
    const [lng, lat, z] = raw.split(",").map(Number);
    if (![lng, lat, z].every((n) => Number.isFinite(n))) return null;
    return { longitude: lng, latitude: lat, zoom: z };
  }, [routeCameraParam]);
  // A pooled Mapbox instance can emit the camera it retained from an older
  // route before the requested `?c=` camera is restored. Do not let that
  // transient move overwrite the address bar and turn the wrong frame into
  // the new source of truth.
  const cameraUrlWriteReadyRef = useRef(!urlCamera);
  // `reuseMaps` keeps the GL instance warm across route changes. That is a
  // major speed win, but Mapbox can then retain the camera from the previous
  // mount and ignore the new component's `initialViewState`. Re-apply an
  // explicit share/return camera after the ref attaches so opening a saved
  // map URL, or returning from full search, restores the view it promises.
  useLayoutEffect(() => {
    cameraUrlWriteReadyRef.current = !urlCamera;
    if (!urlCamera) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const center = map.getCenter();
    const alreadyRestored =
      Math.abs(center.lng - urlCamera.longitude) < 0.00005 &&
      Math.abs(center.lat - urlCamera.latitude) < 0.00005 &&
      Math.abs(map.getZoom() - urlCamera.zoom) < 0.005;
    if (alreadyRestored) {
      cameraUrlWriteReadyRef.current = true;
      return;
    }
    cameraIntentRef.current = true;
    map.jumpTo({
      center: [urlCamera.longitude, urlCamera.latitude],
      zoom: urlCamera.zoom,
    });
  }, [urlCamera]);
  useEffect(() => {
    const updateViewportMode = () => {
      const next = window.innerHeight < 520 && window.innerWidth > window.innerHeight;
      setShortLandscapeViewport((current) => current === next ? current : next);
      const nextCompact = window.innerWidth < 1024;
      setCompactMapViewport((current) => current === nextCompact ? current : nextCompact);
    };
    window.addEventListener("resize", updateViewportMode, { passive: true });
    window.addEventListener("orientationchange", updateViewportMode, { passive: true });
    return () => {
      window.removeEventListener("resize", updateViewportMode);
      window.removeEventListener("orientationchange", updateViewportMode);
    };
  }, []);
  const previousShortLandscape = useRef(shortLandscapeViewport);
  useEffect(() => {
    const wasShortLandscape = previousShortLandscape.current;
    previousShortLandscape.current = shortLandscapeViewport;
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Keep the Mapbox imperative state in step with the reactive prop during
    // an orientation transition, then resize before calculating the fit.
    map.setMaxBounds(shortLandscapeViewport ? SHORT_LANDSCAPE_MAX_BOUNDS : cameraMaxBounds);
    map.resize();

    const viewportModeChanged = shortLandscapeViewport !== wasShortLandscape;
    const untouchedCountyView = Boolean(initialBounds) && !recenterToKnownLocation && !urlCamera;
    if (!viewportModeChanged || !untouchedCountyView || cameraIntentRef.current) return;

    requestAnimationFrame(() => {
      map.resize();
      map.fitBounds(FREDERICK_COUNTY_BOUNDS, {
        padding: countyFitPadding(),
        duration: prefersReducedMotion() ? 0 : 450,
        easing: CAM_EASE,
        essential: true,
      });
    });
  }, [cameraMaxBounds, initialBounds, recenterToKnownLocation, shortLandscapeViewport, urlCamera]);
  const { openSheet } = usePlaceSheet();
  // ── Sheet hydration (the /map payload slim). Browse mode ships pin-field
  // records only; the sheet is the one consumer that wants the full card
  // (photos, rating, hours, address). Open INSTANTLY with the pin fields —
  // PlaceSheet optional-chains everything beyond them — then swap in the full
  // record from /api/places/by-slugs (CDN-cached 1h) when it lands, usually
  // within a frame or two. Cache per slug so re-taps are instant + offline-
  // tolerant. Callers holding full records (SavedList, radius mode) just get
  // one redundant background fetch the first time, served from cache.
  const hydratedRef = useRef(new globalThis.Map<string, PlaceCardData>());
  const openPlaceSheet = (pin: MapPinPlace) => {
    // React mirrors the selected slug into the map URL, but a fast Details tap
    // can beat that effect. Commit the selection before the persistent sheet
    // captures its return path so the full page always comes back to the same
    // highlighted place rather than a visually similar, unselected map.
    try {
      if (window.location.pathname === "/map") {
        replaceMapUrlSilently((params) => {
          params.set("place", pin.slug);
          params.delete("event");
        });
      }
    } catch {
      // The sheet still opens if address-bar persistence is unavailable.
    }

    const withDist = (x: PlaceCardData): PlaceCardData =>
      userLoc ? { ...x, distance_m: haversineMeters(userLoc, x.geom) } : x;
    const cached = hydratedRef.current.get(pin.slug);
    if (cached) {
      openSheet(withDist(cached));
      return;
    }
    openSheet(withDist(pin as PlaceCardData));
    fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(pin.slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { places?: PlaceCardData[] } | null) => {
        const full = d?.places?.[0];
        if (full && full.slug === pin.slug) {
          hydratedRef.current.set(pin.slug, full);
          openSheet(withDist(full));
        }
      })
      .catch(() => {
        /* offline / transient — the pin-field sheet stays up, still useful */
      });
  };
  // Mode-driven layer defaults. The map mounts client-side via
  // dynamic({ ssr:false }), so the initial mode read here is the
  // localStorage-persisted value (not the SSR fallback). When the
  // user flips the toggle later, the effect below resets the four
  // layer toggles to the new mode's defaults — predictable behavior
  // beats preserving the previous session's manual toggles.
  const { mode } = useMode();
  const initialDefaults = useMemo(() => defaultsFor(mode), [mode]);
  const [selected, setSelected] = useState<Selected>(null);
  const [rawSelectionContext, setRawSelectionContext] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  // A selected map highlight is drawn as a small constellation. It is
  // separate from a selected pin: one finding can connect several entities.
  const [selectedDiscovery, setSelectedDiscovery] = useState<MapDiscovery | null>(null);
  // Event eligibility changes while somebody leaves the map open. Tick only
  // the deterministic finding memo; the interval does not fetch or move the
  // camera, and it stops cleanly when this map unmounts.
  const [discoveryClockMs, setDiscoveryClockMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setDiscoveryClockMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [hover, setHover] = useState<{ lng: number; lat: number; label: string; sub?: string } | null>(null);
  // The hover preview is for a real hovering pointer (a mouse) only. On touch
  // there is no hover: a pan drag fires synthetic mousemove events, so leaving
  // it on makes preview popups flash constantly while the user is just trying
  // to move the map — the "too responsive, snaps up something while moving"
  // complaint. Cached once; `(hover: hover)` is false on phones/tablets.
  const canHoverRef = useRef<boolean | null>(null);
  // Remembered reference-layer choices (per device). Task filters such as
  // categories and amenities never restore on a clean visit; deep-links win.
  const [layerPrefs] = useState(readMapLayerPrefs);
  // Layers a deep-link asked to turn on (e.g. /map?at=...&show=transit),
  // so a search result can center AND reveal the pin. Read once; stored prefs
  // still win when present. AppMap is ssr:false, so window is available.
  const [deepLinkLayers] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const raw = new URLSearchParams(window.location.search).get("show") ?? "";
    return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  });
  // A shared URL with an explicit `show=` contract must reproduce the sender's
  // layer state, not inherit unrelated choices from this device. `show=none`
  // is the intentional empty state used when a person shares a clean map.
  const [hasExplicitLayerView] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("show");
  });
  const [deepLinkedAerial] = useState<AerialPhoto | null>(() => {
    if (compactSubjectMap) return null;
    if (typeof window === "undefined") return null;
    const src = new URLSearchParams(window.location.search).get("aerial");
    return src ? AERIAL_PHOTOS.find((photo) => photo.src === src) ?? null : null;
  });
  // The internal category-chip filter (activeCats) retired with the dock:
  // "places by type" merged into the What pane's intent chips, which filter
  // through the URL (?intent/?sub) like every shareable view. Stored cats
  // prefs are ignored (and cleared on the next write) so no invisible
  // filter can survive without UI to show or clear it.
  const wantsOsmInitially = (initialAmenityGroups ?? []).length > 0;
  // P0-10: a fatal Mapbox failure (missing/invalid token, style auth)
  // must degrade to a stable branded state, never a blank rectangle.
  const [mapError, setMapError] = useState(false);
  // A visible canvas is not proof that Mapbox has loaded its style and sources.
  // This flag deliberately promises only that the load handler ran. Initial
  // amenity/selection camera work may still follow, so do not call it settled.
  const [mapLoaded, setMapLoaded] = useState(false);
  // A browser with no WebGL (locked-down corporate profile, a headless/bot
  // client, GPU blocklisted) can never paint the GL canvas — react-map-gl just
  // renders an empty rectangle, which is exactly the "map failed to load" a
  // reviewer hit. Distinguish it from a transient token/network error so the
  // fallback copy is honest: "reload" won't fix an unsupported browser. Checked
  // once on mount (client only); the same branded overlay covers the dead canvas.
  const [mapUnsupported, setMapUnsupported] = useState(false);
  useEffect(() => {
    if (!hasWebGL()) {
      setMapUnsupported(true);
      setMapError(true);
      onVisualReady?.();
    }
  }, [onVisualReady]);
  // P0-10: a graceful note when the user denies (or we cannot get)
  // geolocation, instead of the "Near me" button silently doing nothing.
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  // Cold open is CLEAN: no layers pre-selected (matching the empty-categories
  // decision above) so the map opens as the live town, not a wall of pins. The
  // mode toggle still applies its curated layers when the user picks a mode.
  // Cold open is normally CLEAN, but a deep-link (/map?amenity=restroom from
  // /amenities or /today) pre-activates those groups and opens the tray so the
  // requested amenity layer is on at first paint.
  const [amenityGroups, setAmenityGroups] = useState<Set<string>>(
    // Only an explicit deep-link/task may activate an amenity layer.
    () => new Set(initialAmenityGroups ?? []),
  );
  useEffect(() => {
    if (!isBrowseMap) return;
    const url = new URL(window.location.href);
    const active = [...amenityGroups].sort();
    if (active.length > 0) url.searchParams.set("amenity", active.join(","));
    else url.searchParams.delete("amenity");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [amenityGroups, isBrowseMap]);
  // Whether a dock pane is open — mirrored onto the host container so
  // CSS can hide the zoom corner furniture while the dock is expanded.
  const [dockPaneOpen, setDockPaneOpen] = useState(false);
  // Runtime health contract for the map's own place marks. The source and
  // invisible hit layer can survive while a malformed style expression drops
  // every visible dot/icon, so browser tests need a signal from the rendered
  // Mapbox style rather than a generic "map loaded" check.
  const [placeMarksHealth, setPlaceMarksHealth] = useState<
    "pending" | "ready" | "missing"
  >("pending");
  const [amenityMarksHealth, setAmenityMarksHealth] = useState<
    "off" | "pending" | "ready" | "missing"
  >(() => (amenityGroups.size > 0 ? "pending" : "off"));
  useEffect(() => {
    setAmenityMarksHealth(amenityGroups.size > 0 ? "pending" : "off");
  }, [amenityGroups]);
  // The outer-edge tools introduce themselves, then soften when the map is
  // quiet. Any real map/tool interaction wakes them; active layer buttons stay
  // fully visible through CSS even after the inactive chrome fades.
  const [edgeToolsAwake, setEdgeToolsAwake] = useState(true);
  const edgeToolsIdleTimerRef = useRef<number | null>(null);
  const edgeToolsLastWakeRef = useRef(0);
  const wakeMapEdgeTools = useCallback(() => {
    // Phone browse exposes only the always-visible Locate action. Pointer
    // movement should not wake parent React state and rebuild the full map
    // tree when there is no fading desktop rail to reveal.
    if (!isBrowseMap || compactMapViewport) return;
    const now = window.performance.now();
    if (
      now - edgeToolsLastWakeRef.current < 300 &&
      edgeToolsIdleTimerRef.current !== null
    ) {
      return;
    }
    edgeToolsLastWakeRef.current = now;
    setEdgeToolsAwake(true);
    if (edgeToolsIdleTimerRef.current !== null) {
      window.clearTimeout(edgeToolsIdleTimerRef.current);
    }
    edgeToolsIdleTimerRef.current = window.setTimeout(() => {
      edgeToolsIdleTimerRef.current = null;
      setEdgeToolsAwake(false);
    }, 5_000);
  }, [compactMapViewport, isBrowseMap]);
  useEffect(() => {
    wakeMapEdgeTools();
    return () => {
      if (edgeToolsIdleTimerRef.current !== null) {
        window.clearTimeout(edgeToolsIdleTimerRef.current);
      }
    };
  }, [wakeMapEdgeTools]);
  const [selectedEvent, setSelectedEvent] = useState<EventPin | null>(null);
  const [eventGroup, setEventGroup] = useState<MapEventGroup | null>(null);
  // Camera membership and committed result membership are separate. The first
  // keeps DOM pins outside the visible canvas out of the keyboard sequence;
  // the second keeps result counts and discovery ranking stable until the
  // reader accepts a manually panned area.
  const [eventSlugsInCamera, setEventSlugsInCamera] = useState<Set<string>>(
    () => new Set(),
  );
  const [eventSlugsInView, setEventSlugsInView] = useState<Set<string>>(
    () => new Set(),
  );
  // Time scrubber (living map): null = live/off; otherwise a 0-24 Frederick
  // hour the map re-evaluates against. Pure client state — no refetch, no
  // server mode change.
  const [scrubHour, setScrubHour] = useState<number | null>(null);
  // (Mark-a-spot left the map entirely, owner call 2026-07-02: the in-map
  // mark mode built earlier the same day still read as overlay clutter on
  // the map surface. Marking lives at /report, linked from the map's report
  // entry point, and submitted reports still render via the community
  // reports layer.)
  // Search is part of the shareable map state. When a visitor follows a place
  // result and uses Back to map, restore the query along with the camera and
  // layers instead of returning them to a visually identical but blank map.
  // AppMap is mounted with `ssr: false`, so the first client render can safely
  // seed this from the exact URL carried through `returnTo`.
  const routeQuery = (routeSearchParams.get("q") ?? "").slice(0, 160);
  const [q, setQ] = useState(() => {
    if (typeof window === "undefined") return "";
    return (new URLSearchParams(window.location.search).get("q") ?? "").slice(0, 160);
  });
  const pendingLocalQueryRef = useRef<string | null>(null);
  const setMapQuery = useCallback(
    (updater: string | ((current: string) => string)) => {
      setQ((current) => {
        const next =
          typeof updater === "function" ? updater(current) : updater;
        // MapDock serializes a trimmed query into the URL. Track that exact
        // representation so a harmless trailing space cannot leave route/back
        // synchronization blocked forever.
        pendingLocalQueryRef.current = next.trim();
        return next;
      });
    },
    [],
  );
  // Next keeps recently visited route segments in its client cache. Returning
  // from a full place page can therefore revive this map with its prior local
  // state even though the exact return URL includes a query. Treat the router
  // URL as authoritative whenever that route snapshot changes so the visible
  // search field and the shareable map state cannot drift apart.
  useEffect(() => {
    const liveRouteQuery = (
      new URLSearchParams(window.location.search).get("q") ?? ""
    ).slice(0, 160);
    const pendingLocal = pendingLocalQueryRef.current;
    if (pendingLocal !== null) {
      if (liveRouteQuery !== pendingLocal) {
        // The address bar moved somewhere else (Back, returnTo, or an
        // explicit map command). That is a real navigation, not the stale
        // router snapshot from our debounced local write.
        pendingLocalQueryRef.current = null;
      } else if (routeQuery === pendingLocal) {
        pendingLocalQueryRef.current = null;
      } else {
        // Native history synchronization is asynchronous. Do not let the
        // previous URL value overwrite a newer phrase while the 240ms
        // shareable-query debounce is still catching up.
        return;
      }
    }
    setQ((current) =>
      current === liveRouteQuery ? current : liveRouteQuery,
    );
  }, [routeQuery]);
  // Back and Forward are browser actions, so restore their exact query from
  // the address bar immediately instead of waiting for Next's route snapshot
  // to settle. Under a busy map load that snapshot can arrive late enough for
  // the field to keep showing the destination the visitor just left.
  useEffect(() => {
    const restoreBrowserQuery = () => {
      pendingLocalQueryRef.current = null;
      const next = (
        new URLSearchParams(window.location.search).get("q") ?? ""
      ).slice(0, 160);
      setQ((current) => (current === next ? current : next));
    };
    window.addEventListener("popstate", restoreBrowserQuery);
    return () => window.removeEventListener("popstate", restoreBrowserQuery);
  }, []);
  const [searchMatches, setSearchMatches] = useState<SearchResult[]>([]);
  const [searchSettledQuery, setSearchSettledQuery] = useState("");
  const [searchUnavailableQuery, setSearchUnavailableQuery] = useState("");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [searchOpeningId, setSearchOpeningId] = useState<string | null>(null);
  const searchRequestRef = useRef(0);
  const searchSessionRef = useRef<string | null>(null);
  const searchSessionStartedRef = useRef(false);
  const searchSessionLastUsedRef = useRef(0);
  const searchSessionSuggestCountRef = useRef(0);
  const searchRouteRef = useRef<string | null>(null);
  const autoFocusedSearchResultRef = useRef<string | null>(null);
  // A global Find result can hand the map both a camera point and a place slug.
  // The camera is seeded by BrowseMapClient; this slug opens the same compact
  // peek a direct pin tap would once the map style is ready.
  const initialPlaceSlug = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("place");
  }, []);
  const initialEventSlug = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("event");
  }, []);
  const deepLinkPlaceAppliedRef = useRef(false);
  const deepLinkEventAppliedRef = useRef(false);
  const deepLinkAmenityAppliedRef = useRef(false);
  const [selectionUrlReady, setSelectionUrlReady] = useState(false);
  useEffect(() => {
    if (!isBrowseMap || !selectionUrlReady) return;
    replaceMapUrlSilently((params) => {
      if (selectedSlug) params.set("place", selectedSlug);
      else params.delete("place");
      if (selectedEvent) params.set("event", selectedEvent.slug);
      else params.delete("event");
    });
  }, [isBrowseMap, selectedEvent, selectedSlug, selectionUrlReady]);
  // Pin peek — the compact bottom card that rises when a curated pin is
  // tapped (photo, open state, distance, Save + Directions). Upgrades the
  // cramped popup into a real card you can act on without leaving the map.
  const [peekPlace, setPeekPlace] = useState<MapPinPlace | null>(null);
  // True once the camera has moved off the county overview. Both zoom and the
  // visible bounds matter: a pan can clip the county without changing zoom.
  // Drives the reset FAB and hides again once fitCounty() settles.
  const [offOverview, setOffOverview] = useState(false);
  const [userLoc, setUserLoc] = useState<LngLat | null>(locationSeed.ranking);
  const [userAccuracyM, setUserAccuracyM] = useState<number | null>(() => {
    const cached = readCachedGeoPosition();
    return cached && Number.isFinite(cached.accuracy) ? cached.accuracy : null;
  });
  const [locationFixTimestamp, setLocationFixTimestamp] = useState<number | null>(() =>
    readCachedGeoPosition()?.timestamp ?? null,
  );
  // Ranking fallback when there's no device fix: the saved home town's
  // centroid. Privacy-free (client-local preference, no prompt), and it makes
  // "closest to you first" true for home-town users who never shared location.
  // Read once per mount — a home-town change lands on the next visit.
  const homeCentroid = useMemo(() => {
    const slug = getHomeMuni();
    return slug ? MUNICIPALITIES.find((m) => m.slug === slug)?.centroid ?? null : null;
  }, []);
  const [locating, setLocating] = useState(false);
  const {
    state: sharedGeolocationState,
    requestHighAccuracy: requestSharedGeolocation,
    requestIfGranted: refreshGrantedGeolocation,
  } = useGeolocation();
  const locateRequestedRef = useRef(false);
  const automaticLocationCheckRef = useRef(false);

  // A returning visitor who already granted location should never have their
  // results ranked from an invisible map-center fallback. Refresh the fix
  // silently, but preserve the county overview until they explicitly tap the
  // locate control. First-time visitors are never prompted from this effect.
  useEffect(() => {
    const cached = readCachedPosition();
    if (
      !isBrowseMap ||
      automaticLocationCheckRef.current ||
      (cached && isInFrederickCounty(cached.lng, cached.lat))
    ) {
      return;
    }

    automaticLocationCheckRef.current = true;
    void refreshGrantedGeolocation();
  }, [isBrowseMap, refreshGrantedGeolocation]);

  // Location can be granted from Ask, Today, or the map itself. The shared
  // same-tab event keeps map ranking current without moving the camera.
  useEffect(() => {
    const syncRankingLocation = () => {
      const cached = readCachedGeoPosition();
      setUserLoc(
        cached && isInFrederickCounty(cached.lng, cached.lat) ? cached : null,
      );
      setUserAccuracyM(
        cached && isInFrederickCounty(cached.lng, cached.lat)
          ? cached.accuracy
          : null,
      );
      setLocationFixTimestamp(
        cached && isInFrederickCounty(cached.lng, cached.lat)
          ? cached.timestamp
          : null,
      );
    };
    window.addEventListener(GEOLOCATION_CHANGE_EVENT, syncRankingLocation);
    return () =>
      window.removeEventListener(GEOLOCATION_CHANGE_EVENT, syncRankingLocation);
  }, []);

  // Only an explicit tap on Locate may move the camera. Hook hydration can
  // update ranking silently, but it never enters this branch.
  useEffect(() => {
    if (!locateRequestedRef.current) return;
    if (
      sharedGeolocationState.status === "idle" ||
      sharedGeolocationState.status === "loading"
    ) {
      return;
    }

    locateRequestedRef.current = false;
    setLocating(false);

    if (sharedGeolocationState.status === "granted") {
      const loc = {
        lng: sharedGeolocationState.position.lng,
        lat: sharedGeolocationState.position.lat,
      };
      cameraIntentRef.current = true;
      haptic("light");
      track("map_locate", {
        in_county: isInFrederickCounty(loc.lng, loc.lat),
      });

      if (!isInFrederickCounty(loc.lng, loc.lat)) {
        setUserLoc(null);
        setUserAccuracyM(null);
        setLocationFixTimestamp(null);
        const nearbyLensActive = isBrowseMap && getScope() === "nearme";
        setGeoMsg(
          nearbyLensActive
            ? "You are outside Frederick County. Showing the whole county."
            : "You are outside Frederick County. Keeping your current map view.",
        );
        if (nearbyLensActive) {
          setScope("county");
          replaceMapUrl((params) => params.delete(SCOPE_PARAM));
          mapRef.current?.getMap().fitBounds(FREDERICK_COUNTY_BOUNDS, {
            padding: countyFitPadding(),
            duration: prefersReducedMotion() ? 0 : 900,
            easing: CAM_EASE,
            essential: true,
          });
        }
        return;
      }

      setGeoMsg(null);
      setUserLoc(loc);
      setUserAccuracyM(sharedGeolocationState.position.accuracy);
      setLocationFixTimestamp(sharedGeolocationState.position.timestamp);
      const map = mapRef.current?.getMap();
      if (map) fitNearbyRadius(map, loc);
      return;
    }

    const nearbyLensActive = isBrowseMap && getScope() === "nearme";
    if (nearbyLensActive) {
      // A failed permission request cannot leave a shareable `in=nearme`
      // promise in the URL or dock. Fall back to the actual county frame and
      // let the shared-scope event update MapDock's header immediately.
      setScope("county");
      replaceMapUrl((params) => params.delete(SCOPE_PARAM));
      mapRef.current?.getMap().fitBounds(FREDERICK_COUNTY_BOUNDS, {
        padding: countyFitPadding(),
        duration: prefersReducedMotion() ? 0 : 900,
        easing: CAM_EASE,
        essential: true,
      });
    }
    setGeoMsg(
      sharedGeolocationState.status === "denied"
        ? nearbyLensActive
          ? "Location is off. Showing the whole county. Enable it in your browser to use Near me."
          : "Location is off. Enable it in your browser to recenter the map."
        : nearbyLensActive
          ? "Couldn't get your location. Showing the whole county."
          : "Couldn't get your location. Keeping your current map view.",
    );
  }, [isBrowseMap, sharedGeolocationState]);
  // The eleven reference-layer switches plus their persistence and URL
  // mirror live in useMapLayerToggles; destructured back into the same
  // local names so every consumer below reads unchanged.
  const {
    showCivic, setShowCivic,
    showTrails, setShowTrails,
    showTransit, setShowTransit,
    showAerial, setShowAerial,
    showCemeteries, setShowCemeteries,
    showParking, setShowParking,
    showRadar, setShowRadar,
    showTraffic, setShowTraffic,
    showIncidents, setShowIncidents,
    showRotorcraft, setShowRotorcraft,
    showCameras, setShowCameras,
  } = useMapLayerToggles({
    compactSubjectMap,
    deepLinkLayers,
    hasExplicitLayerView,
    layerPrefs,
    deepLinkedAerialPresent: Boolean(deepLinkedAerial),
    trailsLayerDefault,
    transitDefaultOn: initialDefaults.lineLayers.includes("transit"),
    isBrowseMap,
  });
  const [selectedAerial, setSelectedAerial] = useState<AerialPhoto | null>(deepLinkedAerial);
  const [selectedCemetery, setSelectedCemetery] = useState<CemeteryPin | null>(null);
  // Tapping a parking garage raises the parking peek; live numbers hydrate
  // from the server-fetched snapshot when the feed is configured, otherwise
  // the markers stay neutral (no fake count).
  const [parkingPeek, setParkingPeek] = useState<ParkingPin | null>(null);
  const [foodTruckPeek, setFoodTruckPeek] = useState<FoodTruckMapPin | null>(null);
  const liveFoodTruckPins = useLiveFoodTrucks(foodTruckPins, isBrowseMap);
  useEffect(() => {
    if (foodTruckPeek && !liveFoodTruckPins.some((pin) => pin.slug === foodTruckPeek.slug)) {
      setFoodTruckPeek(null);
    }
  }, [foodTruckPeek, liveFoodTruckPins]);
  // A finding may reveal the handful of support layers needed to understand
  // its constellation. These are render-only unions: the user's own choices
  // stay untouched, are the only values persisted below, and reappear exactly
  // as they were when the finding closes.
  const visibleAmenityGroups = useMemo(() => {
    const next = new Set(amenityGroups);
    for (const group of selectedDiscovery?.layers.amenityGroups ?? []) next.add(group);
    return next;
  }, [amenityGroups, selectedDiscovery]);
  const amenityLayerActive = visibleAmenityGroups.size > 0;
  const { osmPlaces, osmLoading, osmError } = useOsmPlaces({
    osmFromProps,
    wantsOsmInitially,
    activeAmenityGroupCount: visibleAmenityGroups.size,
  });
  const visibleTransit = showTransit || Boolean(selectedDiscovery?.layers.transit);
  const visibleParking = showParking || Boolean(selectedDiscovery?.layers.parking);
  const visibleAerial = showAerial || Boolean(selectedDiscovery?.layers.aerial);
  const visibleCemeteries = showCemeteries || Boolean(selectedDiscovery?.layers.cemeteries);
  // Newest radar frame's unix seconds — the honesty stamp in the tray.
  // (The radar toggle itself stamps time so nobody mistakes minutes-old
  // radar for real time.)
  const [radarFrameEpoch, setRadarFrameEpoch] = useState<number | null>(null);
  const [radarHealth, setRadarHealth] = useState<LiveLayerHealth>(() =>
    liveLayerHealth({ source: "RainViewer", disabled: true }),
  );
  const [incidentHealth, setIncidentHealth] = useState<LiveLayerHealth>(() =>
    liveLayerHealth({ source: "FrederickScanner", disabled: true }),
  );
  const [liveIncidents, setLiveIncidents] = useState<LiveIncidentSignal[]>([]);
  const [focusedIncidentId, setFocusedIncidentId] = useState<string | null>(
    null,
  );
  const [rotorcraftStatus, setRotorcraftStatus] =
    useState<RotorcraftLayerStatus | null>(null);
  const [cameraHealth, setCameraHealth] = useState<LiveLayerHealth>(() =>
    liveLayerHealth({ source: "Maryland CHART", disabled: true }),
  );
  const transitHealth = useMemo(
    () =>
      liveLayerHealth({
        source: "Frederick County TransIT",
        count: transitLines.features.length,
        unavailable: transitLines.features.length === 0,
      }),
    [transitLines.features.length],
  );
  // MARC station popup (Transit layer, phase 3). Holds the station name;
  // departures are looked up from the marcStations prop at render.
  const [marcPeek, setMarcPeek] = useState<string | null>(null);
  // Bus-stop selection uses the same arrival detail as the dedicated transit
  // map. Keeping it in a bottom drawer makes the result reachable with one
  // thumb and leaves the map visible behind it.
  const [selectedTransitStop, setSelectedTransitStop] = useState<SelectedStop | null>(null);
  // The camera and the result area are deliberately separate. Camera bounds
  // follow every settled pan so off-screen DOM pins leave the tab order. The
  // result bounds move only after a programmatic camera action or an explicit
  // "Show results here" tap, which keeps counts and recommendations from
  // shuffling under a person's finger while they explore.
  const [cameraBounds, setCameraBounds] = useState<MapViewportBounds | null>(null);
  const [viewBounds, setViewBounds] = useState<{
    w: number;
    e: number;
    s: number;
    n: number;
  } | null>(null);
  const isPointInView = useCallback(
    (lng: number, lat: number) =>
      !cameraBounds ||
      (lng >= cameraBounds.west &&
        lng <= cameraBounds.east &&
        lat >= cameraBounds.south &&
        lat <= cameraBounds.north),
    [cameraBounds],
  );
  const [viewCenter, setViewCenter] = useState<LngLat | null>(null);
  const viewCenterRef = useRef<LngLat | null>(null);
  useEffect(() => {
    viewCenterRef.current = viewCenter;
  }, [viewCenter]);
  const committedResultViewportRef = useRef<MapResultViewport | null>(null);
  const manualViewportGestureRef = useRef(false);
  const cameraControlGestureRef = useRef(false);
  const [showResultsHere, setShowResultsHere] = useState(false);
  const [resultAreaAnnouncement, setResultAreaAnnouncement] = useState({
    message: "",
    nonce: 0,
  });
  useEffect(() => {
    if (!cameraBounds) return;
    setEventSlugsInCamera(
      new Set(
        events
          .filter(
            (event) =>
              event.lng >= cameraBounds.west &&
              event.lng <= cameraBounds.east &&
              event.lat >= cameraBounds.south &&
              event.lat <= cameraBounds.north,
          )
          .map((event) => event.slug),
      ),
    );
  }, [cameraBounds, events]);
  useEffect(() => {
    if (!viewBounds) return;
    setEventSlugsInView(
      new Set(
        events
          .filter(
            (event) =>
              event.lng >= viewBounds.w &&
              event.lng <= viewBounds.e &&
              event.lat >= viewBounds.s &&
              event.lat <= viewBounds.n,
          )
          .map((event) => event.slug),
      ),
    );
  }, [events, viewBounds]);
  // Time machine: which season's drone shots are lit. "all" shows every
  // pin; a season fades the others out (cross-fade, not a hard cut).
  const [aerialSeason, setAerialSeason] = useState<AerialSeason>(deepLinkedAerial?.season ?? "all");
  // Mapbox paint transitions ignore the prefers-reduced-motion media
  // query, so gate the cross-fade duration ourselves to honor it.
  const aerialFade = (typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) ? 0 : 450;
  const mapPaintDuration = mapPaintTransitionDuration(prefersReducedMotion());
  // Tap-a-town: the municipality under the last empty-map tap (name +
  // tap point for the popup anchor). Null when no town sheet is open.
  const [civicTown, setCivicTown] = useState<CivicTownSelection | null>(null);
  const [spotSelection, setSpotSelection] = useState<MapSpotSelection | null>(null);

  /** Closers for the live layers that own their popup state internally
   * (buses, MARC, incidents, rotorcraft, work zones, snow routes, flood
   * context). Registered through the LiveLayerGate so the one-foreground
   * promise below actually covers them; before this seam existed a bus
   * popup and a place card could sit open at once, in either order. */
  const liveLayerClosersRef = useRef(createLiveLayerCloserRegistry());

  /** The browse map has many data kinds, but only one foreground result. Keep
   * the existing domain-specific states for their specialized renderers while
   * coordinating every transition through one gate so stale cards can never
   * reappear under the next selection. */
  const clearMapSelection = useCallback(() => {
    liveLayerClosersRef.current.closeAll();
    setSelected(null);
    setRawSelectionContext(null);
    setSelectedSlug(null);
    setSelectedEvent(null);
    setEventGroup(null);
    setCivicTown(null);
    setSelectedTransitStop(null);
    setMarcPeek(null);
    setPeekPlace(null);
    setSelectedAerial(null);
    setSelectedCemetery(null);
    setParkingPeek(null);
    setFoodTruckPeek(null);
    setSelectedDiscovery(null);
    setSpotSelection(null);
    setHover(null);
  }, []);

  /** One stable object per mount, so layers don't re-register every render. */
  const liveLayerGate = useMemo<LiveLayerGate>(
    () => ({
      register: liveLayerClosersRef.current.register,
      onWillOpen: clearMapSelection,
    }),
    [clearMapSelection],
  );

  const openMapSelection = useCallback(
    (next: MapSelectionRequest) => {
      rememberMapSelectionOpener();
      clearMapSelection();
      switch (next.kind) {
        case "place":
          setSelectedSlug(next.value.slug);
          setPeekPlace(next.value);
          break;
        case "raw":
          setSelected(next.value);
          setRawSelectionContext(next.contextLabel ?? null);
          break;
        case "event":
          setSelectedEvent(next.value);
          break;
        case "event-group":
          setEventGroup(next.value);
          break;
        case "town":
          setCivicTown(next.value);
          break;
        case "transit":
          setSelectedTransitStop(next.value);
          break;
        case "marc":
          setMarcPeek(next.value);
          break;
        case "aerial":
          setSelectedAerial(next.value);
          break;
        case "cemetery":
          setSelectedCemetery(next.value);
          break;
        case "parking":
          setParkingPeek(next.value);
          break;
        case "food-truck":
          setFoodTruckPeek(next.value);
          break;
        case "discovery":
          setSelectedDiscovery(next.value);
          break;
        case "spot":
          setSpotSelection(next.value);
          break;
      }
    },
    [clearMapSelection],
  );

  const selectionOpen = Boolean(
    selected ||
      selectedEvent ||
      eventGroup ||
      civicTown ||
      selectedTransitStop ||
      marcPeek ||
      peekPlace ||
      selectedAerial ||
      selectedCemetery ||
      parkingPeek ||
      foodTruckPeek ||
      selectedDiscovery ||
      spotSelection,
  );

  const handleDockPaneOpenChange = useCallback(
    (open: boolean) => {
      setDockPaneOpen(open);
      if (open) clearMapSelection();
    },
    [clearMapSelection],
  );

  useEffect(() => {
    if (!isBrowseMap) return;
    const clearForSearch = () => clearMapSelection();
    window.addEventListener("fr:focus-map-search", clearForSearch);
    return () =>
      window.removeEventListener("fr:focus-map-search", clearForSearch);
  }, [clearMapSelection, isBrowseMap]);

  // 3D relief while browsing the drone archive. The aerial layer is the
  // one mode where the county's terrain IS the content, so toggling it
  // on drapes the map over the DEM the hillshade already loads (fr-dem,
  // no extra tile pyramid) and eases to a gentle pitch; toggling off
  // flattens back to the field-guide plan view. Reduced motion snaps
  // instead of easing. Fail-soft: if the style hasn't installed fr-dem
  // yet (or WebGL is struggling), the map just stays flat.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const apply = () => {
      try {
        if (visibleAerial && map.getSource("fr-dem")) {
          map.setTerrain({ source: "fr-dem", exaggeration: 1.35 });
          map.easeTo({ pitch: 52, duration: aerialFade === 0 ? 0 : 900 });
        } else {
          map.setTerrain(null);
          if (map.getPitch() > 0) map.easeTo({ pitch: 0, duration: aerialFade === 0 ? 0 : 600 });
        }
      } catch {
        /* terrain is a garnish; never let it break the map */
      }
    };
    if (map.isStyleLoaded()) apply();
    else {
      map.once("idle", apply);
      // If deps change (or we unmount) before `idle` fires, drop the queued
      // one-shot so a stale-closure `apply` can't run and the listener can't
      // accumulate on rapid toggling. No-op if it already fired.
      return () => { map.off("idle", apply); };
    }
  }, [visibleAerial, aerialFade]);

  // (Layer-choice persistence and the shareable `show=` URL mirror live in
  // useMapLayerToggles, called above.)

  // An explicitly selected public-essential layer is the foreground task.
  // Keep its clusters/icons above the always-on place dots; otherwise the
  // dense downtown place field can visually erase restrooms or water points.
  useEffect(() => {
    if (amenityGroups.size === 0) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const layers = [
      "amenity-clusters",
      "amenity-cluster-counts",
      "amenity-icons",
      "amenity-labels",
    ];
    const bringForward = () => {
      try {
        for (const layer of layers) {
          if (map.getLayer(layer)) map.moveLayer(layer);
        }
      } catch {
        /* Layer order is an enhancement; data remains available in Contents. */
      }
    };
    if (map.isStyleLoaded()) bringForward();
    else map.once("idle", bringForward);
    return () => {
      map.off("idle", bringForward);
    };
  }, [amenityGroups]);

  // GIS overlays (6.3/6.4): the toggleable layer set, dark by default.
  // The active set lives in the URL (?layers=art,parks) so a view is
  // shareable; MapOverlays lazy-loads and renders each active layer.
  const routeLayersParam = routeSearchParams.get("layers");
  const activeOverlays = useMemo(
    () => parseLayersParam(routeLayersParam),
    [routeLayersParam],
  );
  const writeActiveOverlays = (next: OverlayKey[]) => {
    replaceMapUrl((params) => {
      const serialized = serializeLayers(next);
      if (serialized) params.set("layers", serialized);
      else params.delete("layers");
    });
  };
  const toggleOverlay = (k: OverlayKey) => {
    track("map_layer", { layer: k, on: !activeOverlays.includes(k) });
    writeActiveOverlays(
      activeOverlays.includes(k)
        ? activeOverlays.filter((key) => key !== k)
        : [...activeOverlays, k],
    );
  };

  // Saved-only lens (continuity P2): filter the pins to the user's own
  // saved places, so the map can be read as a personal field guide.
  // useFollowedSlugs covers both the anonymous localStorage path and the
  // signed-in follows DB; the chip renders only when something is saved.
  const { slugs: followedSlugs } = useFollowedSlugs();
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  // Field-notes lens: pins narrowed to places that carry VERIFIED Field Notes
  // (happy hour / deal / parking / insider) — the moat, browsable on the map.
  // Like the saved lens, it's a deliberate selection that shows its set even
  // with no category active.
  const [fieldNotesOnly, setFieldNotesOnly] = useState(false);

  // On mode flip (user tapped the toggle, or geo suggestion landed):
  // reset every layer-toggle to the new mode's defaults. We deliberately
  // do NOT preserve the prior session's manual toggles — the brief calls
  // out predictability over preservation. The first-render guard uses
  // a ref so the initial useState seeding above is not double-applied.
  // Mode no longer pre-seeds MAP LAYERS — neither on open nor on switch. The
  // map opens clean (no layers selected) and the user opts into every layer;
  // a post-mount mode hydration used to re-apply the visitor defaults
  // (restroom + trails) and re-clutter the clean open. Mode still scopes the
  // events + closures (via defaultsFor in mode-scope), just not the layer set.
  // (Categories were already removed from this sync for the same reason.)
  // (The OSM enrichment fetch itself lives in useOsmPlaces, called above.)

  // Tap a result in the synced list → fly there, glow it, light haptic.
  useEffect(() => {
    if (!focus) return;
    const p = places.find((x) => x.slug === focus.slug);
    const map = mapRef.current?.getMap();
    if (!p || !map) return;
    setSelectedSlug(p.slug);
    haptic("light");
    cameraIntentRef.current = true;
    // Pan to the result without zooming in — the user already chose
    // their zoom level; we just move the camera to put the pin in
    // view. This is the change that kills "the map keeps jumping
    // around" on mobile.
    map.easeTo({
      center: [p.geom.lng, p.geom.lat],
      duration: 600,
      easing: CAM_EASE,
      essential: true,
    });
  }, [focus, places]);

  const filteredPlaces = useMemo(() => {
    let base = places;
    // Field-notes lens narrows the base set first, so it intersects cleanly
    // with the saved lens below. (The category-chip filter retired with the
    // dock — "places by type" is the URL-driven intent filter now, applied
    // upstream in BrowseMapClient before `places` arrives.)
    if (fieldNotesOnly) base = base.filter((p) => p.field_notes);
    if (showSavedOnly) return base.filter((p) => followedSlugs.has(p.slug));
    if (fieldNotesOnly) return base;
    // Pinpoint-first: a clean map until the user picks something (unused by
    // /map browse, which always shows the whole clustered set).
    return pinpointDefault ? [] : base;
  }, [places, pinpointDefault, showSavedOnly, followedSlugs, fieldNotesOnly]);

  // The set of pins that MATCH the active place/open/deal filter. Null means
  // no place filter is active and the full curated catalog remains available.
  // An empty Set is intentionally different: it produces an empty source.
  const matchSet = useMemo(
    () => (activeSlugs ? new Set(activeSlugs) : null),
    [activeSlugs],
  );
  // A selected finding should read immediately: its connected place pins stay
  // strong while unrelated place pins recede. This is visual emphasis only;
  // the dock's counts continue to use the user's actual What/Open filters.
  const discoveryPlaceSet = useMemo(() => {
    if (!selectedDiscovery) return null;
    const slugs = selectedDiscovery.points
      .map((point) => point.id.startsWith("place:") ? point.id.slice("place:".length) : null)
      .filter((slug): slug is string => Boolean(slug));
    return slugs.length > 0 ? new Set(slugs) : null;
  }, [selectedDiscovery]);
  const searchPlaceSet = useMemo(() => {
    if (q.trim().length < 2) return null;
    const slugs = searchMatches
      .filter((result) => result.type === "place")
      .map((result) => result.id.replace(/^place:/, ""))
      .filter((slug) => places.some((place) => place.slug === slug));
    return slugs.length > 0 ? new Set(slugs) : null;
  }, [places, q, searchMatches]);
  const visualMatchSet = discoveryPlaceSet ?? searchPlaceSet ?? matchSet;
  // What the dock counts, list, curated pins, and curated clusters all use:
  // the lens-filtered places intersected with the active URL match set.
  const visiblePlaces = useMemo(
    () => curatedPlacesForMapSource(filteredPlaces, matchSet),
    [filteredPlaces, matchSet],
  );

  // The Near me lens is the one-mile Radius drawn around the device fix. It
  // narrows both the source and the result contract, so the dock cannot claim
  // a countywide catalog while the camera is showing a walkable local frame.
  // Until a fix arrives, the existing county set stays visible and the normal
  // permission flow remains honest about what it can establish.
  const resultScopedPlaces = useMemo(
    () =>
      resultScope === "nearme" && userLoc
        ? placesWithinReach(visiblePlaces, userLoc, RADIUS_M)
        : visiblePlaces,
    [resultScope, userLoc, visiblePlaces],
  );

  // Viewport-scoped counts for the dock's count line. O(n) point-in-box
  // per settled move over ≤1.7k pins — negligible next to the GeoJSON
  // rebuild the same states already trigger.
  const inViewPlaces = useMemo(() => {
    if (!viewBounds) return resultScopedPlaces;
    return resultScopedPlaces.filter(
      (p) =>
        p.geom &&
        p.geom.lng >= viewBounds.w &&
        p.geom.lng <= viewBounds.e &&
        p.geom.lat >= viewBounds.s &&
        p.geom.lat <= viewBounds.n,
    );
  }, [resultScopedPlaces, viewBounds]);

  // How many places carry Field Notes — drives the lens chip's count.
  const fieldNotesCount = useMemo(() => places.filter((p) => p.field_notes).length, [places]);

  const readResultViewport = (map: ResultViewportMap): MapResultViewport | null => {
    const b = map.getBounds();
    if (!b) return null;
    const c = map.getCenter();
    return {
      center: { lng: c.lng, lat: c.lat },
      zoom: map.getZoom(),
      bounds: {
        west: b.getWest(),
        east: b.getEast(),
        south: b.getSouth(),
        north: b.getNorth(),
      },
    };
  };

  // Keyboard reachability follows the camera even while the result contract
  // is waiting for a deliberate commit. A panned-off pin must never remain in
  // the tab order merely because the result count is still anchored elsewhere.
  const syncCameraViewport = (viewport: MapResultViewport) => {
    setCameraBounds(viewport.bounds);
    setEventSlugsInCamera(
      new Set(
        events
          .filter(
            (event) =>
              event.lng >= viewport.bounds.west &&
              event.lng <= viewport.bounds.east &&
              event.lat >= viewport.bounds.south &&
              event.lat <= viewport.bounds.north,
          )
          .map((event) => event.slug),
      ),
    );
  };

  // Commit the area used by result counts, discovery ranking, and any synced
  // list consumer. Programmatic moves commit automatically; a gesture commits
  // only through the contextual button below.
  const commitResultViewport = (
    map: ResultViewportMap,
    {
      announce = false,
      writeUrl = false,
    }: { announce?: boolean; writeUrl?: boolean } = {},
  ) => {
    const viewport = readResultViewport(map);
    if (!viewport) return 0;

    syncCameraViewport(viewport);
    committedResultViewportRef.current = viewport;
    setViewBounds({
      w: viewport.bounds.west,
      e: viewport.bounds.east,
      s: viewport.bounds.south,
      n: viewport.bounds.north,
    });
    setViewCenter(viewport.center);
    setEventSlugsInView(
      new Set(
        events
          .filter(
            (event) =>
              event.lng >= viewport.bounds.west &&
              event.lng <= viewport.bounds.east &&
              event.lat >= viewport.bounds.south &&
              event.lat <= viewport.bounds.north,
          )
          .map((event) => event.slug),
      ),
    );
    setShowResultsHere(false);
    manualViewportGestureRef.current = false;
    cameraControlGestureRef.current = false;

    const inside = resultScopedPlaces
      .filter(
        (place) =>
          place.geom.lng >= viewport.bounds.west &&
          place.geom.lng <= viewport.bounds.east &&
          place.geom.lat >= viewport.bounds.south &&
          place.geom.lat <= viewport.bounds.north,
      );

    if (writeUrl) {
      try {
        replaceMapUrl((params) => {
          params.set("c", mapCameraParam(viewport));
        });
      } catch {
        /* Camera sharing is an enhancement; the committed results still hold. */
      }
    }

    if (announce) {
      setResultAreaAnnouncement((current) => ({
        message: mapResultCountAnnouncement(inside.length),
        nonce: current.nonce + 1,
      }));
    }

    if (!onPlacesInView) return inside.length;
    // Rank from the reader's own fix when we have one (cached or granted),
    // else their saved home town's centroid, else the map center. Squared-
    // degree distance is enough to ORDER at county scale (same metric the
    // center sort has always used).
    const ref = userLoc ?? homeCentroid ?? viewport.center;
    const ranked = inside
      .map((place) => ({
        slug: place.slug,
        d: (place.geom.lng - ref.lng) ** 2 + (place.geom.lat - ref.lat) ** 2,
      }))
      .sort((a, z) => a.d - z.d)
      .slice(0, 60)
      .map((x) => x.slug);
    onPlacesInView(ranked);
    return inside.length;
  };

  const commitCurrentResultArea = () => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const count = commitResultViewport(map, { announce: true, writeUrl: true });
    haptic("light");
    track("map_results_area_commit", { place_count: count });
  };

  // Spatial hash of curated places (as DedupeRecords) for the OSM
  // de-dupe — keyed so a ±1 neighborhood spans the shared rule radius.
  const placeDupeIndex = useMemo(() => buildPlaceDupeIndex(places), [places]);

  const osmDupesCurated = useMemo(
    () => makeOsmDupeCheck(placeDupeIndex),
    [placeDupeIndex],
  );

  const filteredOsmGeoJson = useMemo(
    () => buildFilteredOsmGeoJson(osmPlaces, matchSet !== null, osmDupesCurated),
    [matchSet, osmPlaces, osmDupesCurated],
  );

  // Which raw amenity category slugs are active, from the selected groups.
  const activeAmenityCats = useMemo(
    () => activeAmenityCategorySlugs(visibleAmenityGroups),
    [visibleAmenityGroups],
  );

  // Amenities live in their own source, rendered only past street zoom
  // (see the amenity-icons layer minzoom). Empty until the user opts in,
  // so the default map is exactly as uncluttered as before.
  const amenityGeoJson = useMemo(
    () =>
      buildAmenityGeoJson({ activeAmenityCats, amenities, osmPlaces, extraAmenities }),
    [osmPlaces, extraAmenities, amenities, activeAmenityCats],
  );

  // Every place peek can quietly answer the next practical question without
  // forcing the user to close it and rebuild an amenity filter. This joins the
  // deterministic amenity snapshot, fresh OSM/field points, and transit stops;
  // the peek helper deduplicates kinds and keeps only a short walk away.
  const utilityPoints = useMemo<NearbyUtilityPoint[]>(
    () => buildUtilityPoints({ amenities, osmPlaces, extraAmenities, transitStops }),
    [amenities, extraAmenities, osmPlaces, transitStops],
  );
  const amenitySelectionPoints = useMemo(
    () => buildAmenitySelectionPoints({ amenities, osmPlaces, extraAmenities }),
    [amenities, extraAmenities, osmPlaces],
  );

  const focusNearestAmenity = useCallback(
    (groupKey: string) => {
      if (!userLoc) return;
      const group = AMENITY_GROUPS.find((candidate) => candidate.key === groupKey);
      if (!group) return;
      const nearest = nearestMapUtilityPoint(
        userLoc,
        amenitySelectionPoints,
        new Set(group.cats),
      );
      if (!nearest) return;

      openMapSelection({
        kind: "raw",
        value: nearest.point,
        contextLabel: `Nearest mapped ${group.label.toLowerCase()}`,
      });
      setGeoMsg(null);
      const map = mapRef.current?.getMap();
      if (!map) return;
      cameraIntentRef.current = true;
      map.easeTo({
        center: [nearest.point.lng, nearest.point.lat],
        zoom: Math.max(map.getZoom(), 15.5),
        offset: [0, -110],
        duration: prefersReducedMotion() ? 0 : 600,
        easing: CAM_EASE,
        essential: true,
      });
    },
    [amenitySelectionPoints, openMapSelection, userLoc],
  );
  /** Curated places use semantic zoom on the county and compact subject maps:
   * clusters at broad/town zoom, then individual dots and category pucks.
   * Other embeds keep every already-scoped place individually represented. */
  const curatedGeoJson = useMemo(
    () =>
      buildCuratedGeoJson(resultScopedPlaces, {
        amenitiesActive: amenityGroups.size > 0,
        visualMatchSet,
        searchPlaceSet,
      }),
    [amenityGroups, resultScopedPlaces, searchPlaceSet, visualMatchSet],
  );

  // ── Living-map scrub → place open/closed via feature-state ──────────────
  // Snappy by design: rather than re-serializing the GeoJSON source, flip a
  // per-pin `dim` feature-state and let the icon-opacity expression paint it
  // on the GPU. A generated hours-only artifact is lazy-loaded on first scrub
  // (the deliberately-slimmed browse payload carries no hours), then reused.
  // Reapplied whenever the source data changes (Mapbox clears feature-state on
  // setData) or the hour moves; cleared when the scrubber turns off.
  const clientHoursRef = useRef<globalThis.Map<string, { hours: PlaceCardData["hours"]; verified: boolean }> | null>(null);
  const scrubDimStateRef = useRef(new globalThis.Map<string, boolean>());
  const scrubSourceRef = useRef<typeof curatedGeoJson | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function apply() {
      const m = mapRef.current?.getMap();
      if (!m || !m.getSource("curated-places")) return;
      if (scrubHour == null) {
        m.removeFeatureState({ source: "curated-places" });
        scrubDimStateRef.current.clear();
        scrubSourceRef.current = curatedGeoJson;
        return;
      }
      if (!clientHoursRef.current) {
        const mod = await import("@/lib/loaders/places-client-hours");
        if (cancelled) return;
        clientHoursRef.current = new globalThis.Map(
          mod.clientPlaceHours().map((p) => [
            p.slug,
            { hours: p.hours, verified: p.hours_verified },
          ] as const),
        );
      }
      const hoursBySlug = clientHoursRef.current;
      if (!hoursBySlug) return;
      // setData clears Mapbox feature-state. A changed GeoJSON object therefore
      // needs one complete reapply; ordinary playback ticks only write places
      // whose open/closed result changed since the previous step.
      if (scrubSourceRef.current !== curatedGeoJson) {
        scrubDimStateRef.current.clear();
        scrubSourceRef.current = curatedGeoJson;
      }
      const at = scrubInstant(scrubHour);
      for (const p of resultScopedPlaces) {
        const h = hoursBySlug.get(p.slug);
        const open = h?.hours ? isOpenNow(getOpenStatus(h.hours, { verified: h.verified }, at)) : true;
        const dim = !open;
        if (scrubDimStateRef.current.get(p.slug) === dim) continue;
        m.setFeatureState({ source: "curated-places", id: p.slug }, { dim });
        scrubDimStateRef.current.set(p.slug, dim);
      }
    }
    const m = mapRef.current?.getMap();
    if (m && m.isSourceLoaded("curated-places")) apply();
    else if (m) m.once("idle", apply);
    return () => { cancelled = true; };
  }, [scrubHour, curatedGeoJson, resultScopedPlaces]);

  const selectedPlace = useMemo(
    () => (selectedSlug ? visiblePlaces.find((place) => place.slug === selectedSlug) ?? null : null),
    [selectedSlug, visiblePlaces],
  );
  useEffect(() => {
    if (selectedSlug && !selectedPlace) clearMapSelection();
  }, [clearMapSelection, selectedPlace, selectedSlug]);

  // The single selected place uses the Radius brick regardless of category.
  // Category remains visible on the result card; the map itself gains one
  // predictable selection color instead of making every tap feel different.
  const selectedGeoJson = useMemo(
    () => buildSelectedGeoJson(selectedPlace),
    [selectedPlace],
  );

  // Municipality centroid labels — static data, built once in
  // mapGeoJsonSources.ts (stable identity, no memo needed).
  const muniLabelsGeoJson = MUNI_LABELS_GEOJSON;

  // Auto-fit retired. Earlier behavior fitBounds-ed the camera on every
  // category change, which on mobile reads as the map jumping around
  // for no reason the user asked for. The user owns the camera now:
  // pan/zoom only changes via their explicit gesture (or Near me).
  // The filtered set still drives which pins are visible — just not
  // the camera position.

  const onClick = (e: MapMouseEvent) => {
    // A map gesture dismisses transient panels through `fr:map-gesture`, but
    // it does not erase the person's search or shareable query. Clearing text
    // merely because someone adjusted the map made the search feel unreliable.
    clearMapSelection();
    const feature = e.features?.[0];
    if (!feature) {
      // Empty map space is for panning, orientation, and dismissing a result.
      // Do not invent a new "At this spot" task from every stray tap. The spot
      // card remains available for an explicit temporary search result.
      return;
    }
    const layer = feature.layer?.id;
    if (!layer) { setSelectedSlug(null); return; }
    if (layer === "muni-label") {
      const name = String(feature.properties?.name ?? "");
      const slug = String(feature.properties?.slug ?? "");
      if (name && slug) {
        openMapSelection({
          kind: "town",
          value: { name, slug, lng: e.lngLat.lng, lat: e.lngLat.lat },
        });
        haptic("light");
      }
      return;
    }
    if (layer === "marc-station-pins" || layer === "marc-station-hit") {
      openMapSelection({
        kind: "marc",
        value: String(feature.properties?.name ?? ""),
      });
      haptic("light");
      return;
    }
    if (layer === "transit-stop-hit") {
      const props = (feature.properties ?? {}) as { id?: string; name?: string };
      if (feature.geometry.type === "Point" && props.id != null) {
        // A stop is the one active map result. Clear every competing peek so
        // closing its drawer cannot reveal a stale card from an earlier tap.
        setSelected(null);
        setSelectedSlug(null);
        setPeekPlace(null);
        setParkingPeek(null);
        setFoodTruckPeek(null);
        setMarcPeek(null);
        setSelectedAerial(null);
        setSelectedCemetery(null);
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        openMapSelection({
          kind: "transit",
          value: {
            id: String(props.id),
            name: String(props.name ?? "Bus stop"),
            lng,
            lat,
          },
        });
        haptic("light");
      }
      return;
    }
    const map = mapRef.current?.getMap();

    // County and compact-subject maps represent broad views with counted
    // clusters. Tapping one reveals the next level without making the user
    // guess where overlapping downtown pins went.
    if (layer === "curated-clusters" && map) {
      setSelectedSlug(null);
      setPeekPlace(null);
      const clusterId = feature.properties?.cluster_id as number | undefined;
      const source = map.getSource("curated-places") as
        | GeoJSONSource
        | undefined;
      if (
        clusterId !== undefined &&
        source &&
        "getClusterExpansionZoom" in source
      ) {
        (
          source as unknown as {
            getClusterExpansionZoom: (
              id: number,
              callback: (error: Error | null, zoom: number) => void,
            ) => void;
          }
        ).getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) return;
          const coordinates = (
            feature.geometry as GeoJSON.Point
          ).coordinates as [number, number];
          cameraIntentRef.current = true;
          smoothFocus(map, coordinates, {
            minZoom: zoom,
            maxStep: 3,
          });
        });
      }
      return;
    }

    if (layer === "amenity-clusters" && map) {
      const clusterId = feature.properties?.cluster_id as number | undefined;
      const source = map.getSource("amenities") as GeoJSONSource | undefined;
      if (
        clusterId !== undefined &&
        source &&
        "getClusterExpansionZoom" in source
      ) {
        (
          source as unknown as {
            getClusterExpansionZoom: (
              id: number,
              callback: (error: Error | null, zoom: number) => void,
            ) => void;
          }
        ).getClusterExpansionZoom(clusterId, (error, zoom) => {
            if (error) return;
            const coordinates = (
              feature.geometry as GeoJSON.Point
            ).coordinates as [number, number];
            cameraIntentRef.current = true;
            smoothFocus(map, coordinates, {
              minZoom: zoom,
              maxStep: 3,
            });
          });
      }
      return;
    }

    // OSM cluster expansion.
    if (layer === "clusters" && map) {
      setSelectedSlug(null);
      track("map_cluster");
      const clusterId = feature.properties?.cluster_id as number | undefined;
      const source = map.getSource("osm-businesses") as GeoJSONSource | undefined;
      if (clusterId !== undefined && source && "getClusterExpansionZoom" in source) {
        (source as unknown as { getClusterExpansionZoom: (id: number, cb: (err: Error | null, zoom: number) => void) => void })
          .getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
            // Glide toward the expansion zoom, but clamped so a tap on a
            // dense downtown cluster steps in calmly instead of snapping
            // the whole county to street level. Very dense clusters take
            // a second tap — that gentle tiering is the intended feel.
            cameraIntentRef.current = true;
            smoothFocus(map, coords, { minZoom: zoom, maxStep: 2.5 });
          });
      }
      return;
    }

    if (layer === "curated-icons" || layer === "curated-active-icons" || layer === "curated-hit") {
      const props = feature.properties as Record<string, string>;
      const place = places.find((p) => p.slug === props.slug);
      setSelectedSlug(props.slug);
      haptic("light");
      // Google-Maps-style: tap a pin → full card slides up from the bottom
      // (photo, rating, hours, directions, save) instead of a cramped popup.
      // Distance must be from the USER, never a fixed city point — show it
      // only when we actually have their location, else omit it (honest).
      if (place) {
        // A quick PEEK card rises from the bottom (photo, open state,
        // distance, Save + Directions) so the user can act without leaving
        // the map; "Open page" in the peek hands off to the full sheet.
        openMapSelection({ kind: "place", value: place });
        // Lift the tapped pin above the bottom card (Google/Apple pattern):
        // shift the camera up so the pin + its selected glow stay visible
        // instead of hiding under the card that just rose over them.
        const m = mapRef.current?.getMap();
        cameraIntentRef.current = true;
        m?.easeTo({
          center: [place.geom.lng, place.geom.lat],
          zoom: Math.max(m.getZoom(), 14),
          offset: [0, -120],
          duration: prefersReducedMotion() ? 0 : 500,
          essential: true,
        });
      }
      track("map_pin", { category: place?.category ?? "unknown" });
      return;
    }

    if (layer === "aerial-icons") {
      const idx = Number(feature.properties?.idx);
      const photo = AERIAL_PHOTOS[idx];
      if (photo) {
        haptic("light");
        openMapSelection({ kind: "aerial", value: photo });
      }
      return;
    }

    if (layer === "cemetery-icons") {
      const id = String(feature.properties?.id ?? "");
      const cem = cemeteries.find((c) => c.id === id);
      if (cem) {
        haptic("light");
        openMapSelection({ kind: "cemetery", value: cem });
      }
      return;
    }

    if (layer === "osm-icons" || layer === "amenity-icons") {
      const props = feature.properties as Record<string, string>;
      setSelectedSlug(null);
      haptic("light");
      openMapSelection({
        kind: "raw",
        value: {
          _kind: "osm",
          osm_id: props.osm_id,
          name: props.name,
          category_slug: props.category,
          osm_tag: props.osm_tag,
          address: props.address,
          city: props.city,
          phone: props.phone,
          website: props.website,
          opening_hours: props.opening_hours,
          cuisine: props.cuisine,
          photo: props.photo || undefined,
          observed_at: props.observed_at || undefined,
          lng: (feature.geometry as GeoJSON.Point).coordinates[0] as number,
          lat: (feature.geometry as GeoJSON.Point).coordinates[1] as number,
        },
      });
    }
  };

  // Lightweight hover preview: name (and category) of the pin under the
  // pointer, so the map is scannable without clicking every icon.
  const onHover = (e: MapMouseEvent) => {
    if (canHoverRef.current === null) {
      canHoverRef.current =
        typeof window !== "undefined" &&
        window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true;
    }
    if (!canHoverRef.current) return; // touch device: no hover preview while panning
    const f = e.features?.[0];
    if (!f || !f.layer?.id) { setHover((h) => (h ? null : h)); return; }
    const props = (f.properties ?? {}) as Record<string, string | number>;
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    let next: { lng: number; lat: number; label: string; sub?: string } | null = null;
    if (
      f.layer.id === "clusters" ||
      f.layer.id === "curated-clusters" ||
      f.layer.id === "amenity-clusters"
    ) {
      const count = Number(props.point_count);
      const family =
        f.layer.id === "curated-clusters"
          ? dominantClusterFamilyLabel(props)
          : null;
      next = {
        lng,
        lat,
        label: Number.isFinite(count)
          ? `${count.toLocaleString("en-US")} mapped ${
              f.layer.id === "amenity-clusters" ? "amenities" : "places"
            }`
          : f.layer.id === "amenity-clusters"
            ? "A cluster of amenities"
            : "A cluster of places",
        sub: family ? `Mostly ${family.toLocaleLowerCase()}` : undefined,
      };
    } else if (f.layer.id === "curated-icons" || f.layer.id === "curated-active-icons" || f.layer.id === "curated-hit") {
      const p = places.find((x) => x.slug === props.slug);
      if (p) next = { lng, lat, label: p.name, sub: CATEGORY_BY_SLUG[p.category]?.name };
    } else {
      const name = String(props.name ?? "").trim();
      if (name) next = { lng, lat, label: name, sub: CATEGORY_BY_SLUG[String(props.category)]?.name ?? undefined };
    }
    setHover((h) =>
      h && next && h.label === next.label && h.lng === next.lng ? h : next,
    );
  };

  // OSM amenities are flaky (live Overpass; empty in the sandbox). The
  // curated amenities.json is always present, so the Amenities tray is
  // gated on EITHER source having points — that is the fix for "I
  // don't see the water fountains / things we just added".
  const amenityCount = osmPlaces.filter(isAmenity).length + amenities.length;
  const amenityGroupCounts = useMemo(() => {
    const categoryCounts = new globalThis.Map<string, number>();
    const add = (category: string) => {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    };
    for (const amenity of amenities) add(AMENITY_KIND_TO_CAT[amenity.kind]);
    for (const place of [...osmPlaces, ...extraAmenities]) {
      if (isAmenity(place)) add(place.category_slug);
    }
    return Object.fromEntries(
      AMENITY_GROUPS.map((group) => [
        group.key,
        group.cats.reduce(
          (total, category) => total + (categoryCounts.get(category) ?? 0),
          0,
        ),
      ]),
    );
  }, [amenities, extraAmenities, osmPlaces]);

  // A valid group name is not the same as available map data. Old links and
  // partially mapped field-tool categories can otherwise leave a selected
  // layer with no marks. Wait for optional OSM enrichment, then keep only
  // groups that have at least one verified point and make the URL truthful.
  useEffect(() => {
    if (osmLoading || osmError || amenityGroups.size === 0) return;
    const unavailable = [...amenityGroups].filter(
      (key) => (amenityGroupCounts[key] ?? 0) === 0,
    );
    if (unavailable.length === 0) return;

    const next = new Set(
      [...amenityGroups].filter(
        (key) => (amenityGroupCounts[key] ?? 0) > 0,
      ),
    );
    setAmenityGroups(next);

    const url = new URL(window.location.href);
    if (next.size > 0) url.searchParams.set("amenity", [...next].join(","));
    else url.searchParams.delete("amenity");
    window.history.replaceState(window.history.state, "", url.toString());

    const labels = unavailable.map(
      (key) =>
        AMENITY_GROUPS.find((group) => group.key === key)?.label ?? key,
    );
    setGeoMsg(
      `No verified map points are available yet for ${labels.join(", ")}.`,
    );
  }, [amenityGroupCounts, amenityGroups, osmError, osmLoading]);
  const communityReportCount = extraAmenities.filter((point) =>
    point.category_slug.startsWith("report-"),
  ).length;

  // On-map search remains Radius-first. Only when the canonical local index
  // has no answer does the map ask Search Box for a temporary county-bounded
  // location. Real walking times refine a stable local result set when the
  // user has explicitly shared a device fix; every paid enhancement fails
  // back to the immediate Radius answer.
  const router = useRouter();
  useEffect(() => {
    const term = q.trim();
    const requestId = ++searchRequestRef.current;
    const origin =
      userLoc ?? viewCenterRef.current ?? searchFallbackOriginRef.current;
    const immediateMatches = immediateMapPlaceResults(
      places,
      term,
      origin,
      6,
    );
    const confidentImmediate = confidentLocalMapPlaceResult(
      immediateMatches,
      term,
    );
    if (!confidentImmediate) autoFocusedSearchResultRef.current = null;
    const focusConfidentImmediate = () => {
      if (
        !confidentImmediate ||
        requestId !== searchRequestRef.current ||
        autoFocusedSearchResultRef.current === confidentImmediate.id
      ) {
        return;
      }
      const place = places.find(
        (candidate) =>
          candidate.slug === confidentImmediate.id.replace(/^place:/, ""),
      );
      const map = mapRef.current?.getMap();
      if (!place || !map) return;

      autoFocusedSearchResultRef.current = confidentImmediate.id;
      if (
        resultScope === "nearme" &&
        userLoc &&
        haversineMeters(userLoc, place.geom) > RADIUS_M
      ) {
        setResultScope("county");
        if (getScope() !== "county") setScope("county");
        replaceMapUrl((params) => params.delete(SCOPE_PARAM));
      }
      cameraIntentRef.current = true;
      smoothFocus(map, [place.geom.lng, place.geom.lat], {
        // County clusters stop at z15. An exact business search must resolve
        // to the actual branded pin, not leave the answer buried inside a
        // neighborhood count bubble.
        minZoom: 15.5,
        maxStep: 7.5,
      });
      setResultAreaAnnouncement((current) => ({
        message: `Showing ${place.name} on the map.`,
        nonce: current.nonce + 1,
      }));
    };
    // A result from the previous phrase must never remain tappable while this
    // phrase waits for its debounce or network response. A strong name match
    // from the already-loaded Radius pin set may replace it immediately.
    setSearchMatches(immediateMatches);
    setSearchUnavailableQuery("");
    // A retry uses the same phrase, so the prior settled marker would otherwise
    // make the empty-state copy flash before the request begins.
    if (term.length >= 2) {
      setSearchSettledQuery(immediateMatches.length > 0 ? term : "");
    }
    if (term.length < 2) {
      autoFocusedSearchResultRef.current = null;
      setSearchSettledQuery(term);
      searchSessionRef.current = null;
      searchSessionStartedRef.current = false;
      searchSessionLastUsedRef.current = 0;
      searchSessionSuggestCountRef.current = 0;
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      // A decisive local name should move the map and result deck together,
      // without waiting for network enrichment or opening a modal card.
      focusConfidentImmediate();
      const params = new URLSearchParams({ q: term, limit: "6", origin: "map" });
      // About 11m precision is plenty for nearest-first ranking and avoids
      // sending an unnecessarily exact coordinate.
      params.set("lat", origin.lat.toFixed(4));
      params.set("lng", origin.lng.toFixed(4));
      try {
        const response = await fetch(`/api/search?${params.toString()}`, {
          signal: ctrl.signal,
        });
        if (!response.ok) {
          throw new Error(`Radius search returned HTTP ${response.status}`);
        }
        const body = (await response.json()) as { results?: SearchResult[] };
        if (requestId !== searchRequestRef.current) return;
        if (!Array.isArray(body.results)) {
          throw new Error("Radius search returned an invalid response");
        }
        const local = reconcileMapSearchResults(
          immediateMatches,
          body.results,
          term,
          6,
        );

        if (local.length > 0) {
          setSearchMatches(local);
          setSearchSettledQuery(term);
          focusConfidentImmediate();
          const routedCandidates = userLoc
            ? local
                .filter(
                  (result) =>
                    result.type === "place" &&
                    typeof result.lng === "number" &&
                    typeof result.lat === "number",
                )
                .slice(0, 6)
            : [];
          if (routedCandidates.length < 2) return;

          try {
            // Let the local results paint first and avoid a Matrix request for
            // every intermediate keystroke during normal typing.
            await new Promise<void>((resolve) => {
              const delay = window.setTimeout(resolve, 250);
              ctrl.signal.addEventListener(
                "abort",
                () => {
                  window.clearTimeout(delay);
                  resolve();
                },
                { once: true },
              );
            });
            if (ctrl.signal.aborted || requestId !== searchRequestRef.current) return;

            const matrixResponse = await fetch("/api/travel-matrix", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: ctrl.signal,
              body: JSON.stringify({
                profile: "walking",
                origin: userLoc,
                destinations: routedCandidates.map((result) => ({
                  lng: result.lng,
                  lat: result.lat,
                })),
              }),
            });
            const matrix = (matrixResponse.ok
              ? await matrixResponse.json()
              : null) as {
                ok?: boolean;
                legs?: Array<{ destinationIndex: number; minutes: number | null }>;
              } | null;
            if (
              !matrix?.ok ||
              !Array.isArray(matrix.legs) ||
              requestId !== searchRequestRef.current
            ) {
              return;
            }
            const minutesById = new globalThis.Map<string, number>();
            for (const leg of matrix.legs) {
              const result = routedCandidates[leg.destinationIndex];
              if (result && leg.minutes != null) {
                minutesById.set(result.id, leg.minutes);
              }
            }
            setSearchMatches(
              local.map((result) => ({
                ...result,
                travel_minutes: minutesById.get(result.id),
              })),
            );
          } catch {
            // Walking time is an optional refinement. A Matrix outage must
            // never erase the valid Radius results already on screen.
          }
          return;
        }

        if (!isBrowseMap || term.length < 3) {
          setSearchSettledQuery(term);
          return;
        }
        const now = Date.now();
        const sessionExpired =
          searchSessionLastUsedRef.current > 0 &&
          now - searchSessionLastUsedRef.current > 150_000;
        const sessionAtLimit = searchSessionSuggestCountRef.current >= 45;
        if (sessionExpired || sessionAtLimit) {
          searchSessionRef.current = null;
          searchSessionStartedRef.current = false;
          searchSessionSuggestCountRef.current = 0;
        }
        const sessionToken =
          searchSessionRef.current ?? window.crypto.randomUUID();
        searchSessionRef.current = sessionToken;
        searchSessionLastUsedRef.current = now;
        searchSessionSuggestCountRef.current += 1;
        const fallbackResponse = await fetch("/api/map/search-fallback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            action: "suggest",
            q: term,
            sessionToken,
            sessionStart: !searchSessionStartedRef.current,
            proximity: origin,
            limit: 4,
            ...(searchRouteRef.current
              ? {
                  route: searchRouteRef.current,
                  routeGeometry: "polyline6",
                  timeDeviation: 8,
                }
              : {}),
          }),
        });
        const fallback = (fallbackResponse.ok
          ? await fallbackResponse.json()
          : null) as {
            ok?: boolean;
            retryable?: boolean;
            attribution?: string;
            suggestions?: Array<{
              mapboxId: string;
              name: string;
              fullAddress?: string;
              placeFormatted?: string;
              distanceMeters?: number;
              addedTimeMinutes?: number;
            }>;
          } | null;
        if (requestId !== searchRequestRef.current) return;
        if (!fallbackResponse.ok || !fallback) {
          throw new Error(
            `Backup map search returned HTTP ${fallbackResponse.status}`,
          );
        }
        if (!fallback.ok) {
          // A disabled optional Mapbox enhancement does not invalidate the
          // already-completed Radius search. A retryable upstream failure does:
          // never translate an outage into a confident zero-result claim.
          if (fallback.retryable) {
            throw new Error("Backup map search is temporarily unavailable");
          }
          setSearchSettledQuery(term);
          return;
        }
        if (!Array.isArray(fallback.suggestions)) {
          throw new Error("Backup map search returned an invalid response");
        }
        searchSessionStartedRef.current = true;
        setSearchMatches(
          fallback.suggestions.map((suggestion) => ({
            type: "place",
            id: `mapbox:${suggestion.mapboxId}`,
            title: suggestion.name,
            subtitle: [
              suggestion.fullAddress ?? suggestion.placeFormatted,
              suggestion.addedTimeMinutes != null
                ? `Adds ${suggestion.addedTimeMinutes} min to the route`
                : "Temporary Mapbox result",
            ]
              .filter(Boolean)
              .join(" · "),
            href: "#",
            distance_m: suggestion.distanceMeters,
            temporary: true,
            provider: "Mapbox",
            mapbox_id: suggestion.mapboxId,
            attribution: fallback.attribution,
          })),
        );
        setSearchSettledQuery(term);
      } catch (error) {
        if (
          !ctrl.signal.aborted &&
          (error as { name?: string })?.name !== "AbortError" &&
          requestId === searchRequestRef.current
        ) {
          // A delayed enrichment failure must not erase the useful known-place
          // result that was already on screen.
          setSearchMatches(immediateMatches);
          setSearchUnavailableQuery(immediateMatches.length > 0 ? "" : term);
          setSearchSettledQuery(term);
        }
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [isBrowseMap, places, q, resultScope, searchAttempt, userLoc]);

  const placesBySlug = useMemo(() => {
    // globalThis.Map: the bare `Map` is react-map-gl's component here.
    const m = new globalThis.Map<string, MapPinPlace>();
    for (const p of places) m.set(p.slug, p);
    return m;
  }, [places]);

  const pickSearch = async (r: SearchResult) => {
    haptic("light");
    clearMapSelection();
    if (r.temporary && r.provider === "Mapbox") {
      const sessionToken = searchSessionRef.current;
      const mapboxId = r.mapbox_id ?? r.id.replace(/^mapbox:/, "");
      const origin = userLoc ?? viewCenter ?? searchFallbackOriginRef.current;
      if (!sessionToken || !mapboxId) {
        setGeoMsg("That temporary map result expired. Search for it again.");
        return;
      }
      setSearchOpeningId(r.id);
      try {
        const response = await fetch("/api/map/search-fallback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "retrieve",
            mapboxId,
            sessionToken,
            proximity: origin,
          }),
        });
        const body = (response.ok ? await response.json() : null) as {
          ok?: boolean;
          reason?: string;
          attribution?: string;
          result?: {
            name: string;
            coordinates: { lng: number; lat: number };
          };
        } | null;
        if (!body?.ok || !body.result) {
          setGeoMsg(
            body?.reason === "outside-county"
              ? "That result falls outside Frederick County."
              : "That map result could not be opened. Try another search.",
          );
          return;
        }
        const { lng, lat } = body.result.coordinates;
        setMapQuery("");
        setSearchMatches([]);
        searchSessionRef.current = null;
        searchSessionStartedRef.current = false;
        searchSessionLastUsedRef.current = 0;
        searchSessionSuggestCountRef.current = 0;
        openMapSelection({
          kind: "spot",
          value: {
            lng,
            lat,
            label: body.result.name || r.title,
            temporary: true,
            attribution: body.attribution ?? r.attribution,
          },
        });
        cameraIntentRef.current = true;
        mapRef.current?.getMap().easeTo({
          center: [lng, lat],
          zoom: 15,
          offset: [0, -100],
          duration: prefersReducedMotion() ? 0 : 700,
          easing: CAM_EASE,
          essential: true,
        });
      } catch {
        setGeoMsg("That map result could not be opened. Try another search.");
      } finally {
        setSearchOpeningId(null);
      }
      return;
    }
    // A layer result toggles the overlay in place — no navigation.
    const layer = r.id.startsWith("layer:") ? (r.id.slice(6) as OverlayKey) : null;
    if (layer) {
      if (!activeOverlays.includes(layer)) {
        writeActiveOverlays([...activeOverlays, layer]);
      }
      setMapQuery("");
      return;
    }
    // Resident-shaped search commands should act on this map immediately.
    // Routing /map -> /map for a layer URL can preserve the mounted AppMap,
    // which means one-time deep-link initializers never run again. Apply the
    // requested layer state here and mirror it into the URL so the result is
    // both instant and shareable.
    if (r.type === "action" && r.id.startsWith("action:map-")) {
      const target = new URL(r.href, window.location.origin);
      const amenityParam = target.searchParams.get("amenity");
      const showParam = target.searchParams.get("show");
      if (amenityParam || showParam) {
        const requestedShow = new Set(
          (showParam ?? "")
            .split(",")
            .map((key) => key.trim())
            .filter(Boolean),
        );
        const roadsRequested = requestedShow.has("roads");

        // A search command is a new task, not another hidden toggle. Replace
        // the previous task-level amenity/live state so "trash can near me"
        // cannot quietly remain combined with a restroom or radar choice from
        // an earlier visit. Deliberate archival `layers` remain independent.
        if (amenityParam) {
          const validGroups = new Set(AMENITY_GROUPS.map((group) => group.key));
          const requested = amenityParam
            .split(",")
            .map((key) => key.trim())
            .filter((key) => validGroups.has(key));
          if (requested.length > 0) {
            setAmenityGroups(new Set(requested));
          }
        } else {
          setAmenityGroups(new Set());
        }

        setShowParking(requestedShow.has("parking"));
        setShowTransit(requestedShow.has("transit"));
        setShowRadar(requestedShow.has("radar"));
        setShowTraffic(requestedShow.has("traffic") || roadsRequested);
        setShowIncidents(requestedShow.has("incidents") || roadsRequested);
        setShowRotorcraft(requestedShow.has("air"));
        setShowCameras(requestedShow.has("cameras"));
        setShowTrails(requestedShow.has("trails"));
        setShowCivic(requestedShow.has("civic") || roadsRequested);

        // Commit one final URL through Next's native-history bridge. A
        // preceding query-only update can otherwise settle after this command
        // and put the old amenity back in the address bar even though the map
        // already shows the new layer.
        replaceMapUrl((params) => {
          params.delete("q");
          if (amenityParam) params.set("amenity", amenityParam);
          else params.delete("amenity");
          if (showParam) params.set("show", showParam);
          else params.delete("show");
        });
        if (/\bnear\s+me\b/i.test(q)) {
          if (userLoc) {
            cameraIntentRef.current = true;
            mapRef.current?.getMap().flyTo({
              center: [userLoc.lng, userLoc.lat],
              zoom: 15,
              duration: prefersReducedMotion() ? 0 : 800,
              curve: 1.2,
              easing: CAM_EASE,
              essential: true,
            });
          } else {
            goNearMe();
          }
        }
        setMapQuery("");
        return;
      }
    }
    // Selecting a place or event dismisses the search tray, but the query
    // remains part of the exact map state carried into its detail. Reassert it
    // only after handling in-place map commands, whose final URL deliberately
    // clears the query.
    if (q.trim()) {
      replaceMapUrl((params) => params.set("q", q.trim()));
    }
    // A place that's on this map focuses it; anything else (events,
    // towns, categories, places outside the loaded set) navigates.
    if (r.type === "place") {
      const p = placesBySlug.get(r.id.replace(/^place:/, ""));
      if (p) {
        const map = mapRef.current?.getMap();
        if (map) {
          cameraIntentRef.current = true;
          // A named search result is an explicit destination, not a gentle
          // browse nudge. Land close enough to identify the selected place.
          smoothFocus(map, [p.geom.lng, p.geom.lat], { minZoom: 15, maxStep: 6 });
        }
        openMapSelection({ kind: "place", value: p });
        return;
      }
    }

    // A mappable event is already part of this map's event pool. Keep the
    // reader in context, land on its venue, and open the same event popup a
    // pin tap would. If this result is outside the currently loaded event
    // window, the detail route remains the honest fallback below.
    if (r.type === "event") {
      const event = events.find((candidate) => candidate.slug === r.id.replace(/^event:/, ""));
      if (event) {
        const map = mapRef.current?.getMap();
        openMapSelection({ kind: "event", value: event });
        if (map) {
          cameraIntentRef.current = true;
          smoothFocus(map, [event.lng, event.lat], { minZoom: 14.5, maxStep: 6 });
        }
        return;
      }
    }

    // "Find … a town" should not eject someone to a town landing page. Move
    // the map there, persist the town lens in the shared scope, and keep the
    // current filters/layers intact. MapDock subscribes to setScope and owns
    // the full browse-map flight; a dock-less embed receives the same flight
    // directly here.
    if (r.type === "municipality") {
      const slug = r.id.replace(/^municipality:/, "");
      const town = MUNICIPALITIES.find((candidate) => candidate.slug === slug);
      if (town) {
        setMapQuery("");
        cameraIntentRef.current = true;

        try {
          replaceMapUrl((params) => params.set(SCOPE_PARAM, town.slug));
        } catch {
          // URL persistence is an enhancement; scope + camera still update.
        }
        setScope(`town:${town.slug}`);

        if (!dock) {
          mapRef.current?.getMap().flyTo({
            center: [town.centroid.lng, town.centroid.lat],
            zoom: 13.4,
            duration: prefersReducedMotion() ? 0 : 900,
            curve: 1.25,
            easing: CAM_EASE,
            essential: true,
          });
        }
        return;
      }
    }
    router.push(r.href);
  };

  // Near-me reach ring plus the browser's separate accuracy halo. The first
  // answers "what is within my Radius"; the second quietly shows how exact
  // the device fix really is so the center dot never overclaims precision.
  const ringGeoJson = useMemo(() => buildRingGeoJson(userLoc), [userLoc]);
  const clampedAccuracyM = clampLocationAccuracy(userAccuracyM);
  const accuracyGeoJson = useMemo(
    () => buildAccuracyGeoJson(userLoc, clampedAccuracyM),
    [clampedAccuracyM, userLoc],
  );
  const dotGeoJson = useMemo(() => buildDotGeoJson(userLoc), [userLoc]);

  // Directions: a direct connector from you to the selected place, with
  // real distance + drive estimate and a one-tap handoff to native maps.
  // Real walking minutes for the SELECTED place only (Mapbox Directions
  // via /api/walk-time — never fetched per pin). The chip renders the
  // straight-line estimate immediately and swaps the routed figure in
  // place when it lands: same slot, no spinner, no layout shift. The
  // tilde is the honesty marker — "~4 min walk" is the estimate, "5 min
  // walk" is the routed truth. Gated on a real geolocation fix plus
  // walkable range (shouldFetchWalkTime); reselecting aborts the
  // in-flight fetch, and the slug key drops any stale late response.
  const { realWalk, routedWalkActive, routeInfo } = useWalkRoute(userLoc, selectedPlace);
  const routeGeoJson = useMemo(
    () =>
      buildRouteGeoJson({
        userLoc,
        selectedPlace,
        routedWalkActive,
        routedCoordinates: realWalk?.coordinates,
      }),
    [realWalk, routedWalkActive, selectedPlace, userLoc],
  );
  useEffect(() => {
    searchRouteRef.current =
      routedWalkActive && realWalk?.coordinates
        ? encodePolyline(realWalk.coordinates, 6)
        : null;
  }, [realWalk, routedWalkActive]);

  // Mode-aware scoping for civic pins. Visitor mode keeps only
  // major closures (Closed / Detour / Crash / Down …) and hides 311
  // resident-reported issues entirely. Resident mode shows everything
  // ongoing. The scoping is applied even when showCivic is on, so the
  // user's "civic overlay" toggle never lights up visitor-irrelevant
  // 311 dots.
  const scopedCivic = useMemo(() => {
    if (!showCivic) return [] as typeof civic;
    return scopeClosures(civic, defaultsFor(mode).closureScope);
  }, [civic, showCivic, mode]);

  // Depends on scopedCivic directly (which itself folds in civic +
  // showCivic + mode). The previous deps array `[civic, showCivic]`
  // missed `mode`, so flipping Visitor↔Resident could leave the
  // GeoJSON pointing at the previous scoping until the next civic
  // update landed.
  const civicGeoJson = useMemo(() => buildCivicGeoJson(scopedCivic), [scopedCivic]);

  // The spot reader may summarize civic context even when its overlay is off,
  // but it must use the same visitor/resident privacy scope as the visible
  // pins. Keep the pin kind so a resident 311 report is never mislabeled as a
  // road closure.
  const spotCivic = useMemo(
    () => scopeClosures(civic, defaultsFor(mode).closureScope),
    [civic, mode],
  );
  const spotContext = useMemo(
    () =>
      spotSelection
        ? buildMapSpotContext(spotSelection, {
            places: places.map((place) => ({
              slug: place.slug,
              name: place.name,
              category: place.category,
              lng: place.geom.lng,
              lat: place.geom.lat,
            })),
            parking: parking.map((garage) => ({
              name: garage.name,
              available: garage.available,
              lng: garage.lng,
              lat: garage.lat,
            })),
            transit: transitStops.map((stop) => ({
              id: stop.id,
              name: stop.name,
              lng: stop.lng,
              lat: stop.lat,
            })),
            events: events.map((event) => ({
              slug: event.slug,
              title: event.title,
              startsAt: event.starts_at,
              lng: event.lng,
              lat: event.lat,
            })),
            roads: spotCivic.map((pin) => ({
              kind: pin.kind,
              label: pin.label,
              lng: pin.lng,
              lat: pin.lat,
            })),
          })
        : null,
    [events, parking, places, spotCivic, spotSelection, transitStops],
  );

  // Aerial photo GeoJSON — static manifest, built once in
  // mapGeoJsonSources.ts (stable identity, no memo needed).
  const aerialGeoJson = AERIAL_GEOJSON;

  // Historic cemeteries GeoJSON. `name` in properties powers the generic
  // hover preview; the click handler reads the full pin back by `id`.
  const cemeteryGeoJson = useMemo(() => buildCemeteryGeoJson(cemeteries), [cemeteries]);

  const goNearMe = () => {
    setShowResultsHere(false);
    manualViewportGestureRef.current = false;
    cameraControlGestureRef.current = false;
    // A fresh cached/shared fix makes Near me instant. Still ask the shared
    // geolocation hook to refresh it in the background; a newer fix will
    // simply refit the same honest one-mile area when it arrives.
    if (userLoc) {
      const map = mapRef.current?.getMap();
      if (map) {
        cameraIntentRef.current = true;
        fitNearbyRadius(map, userLoc);
      }
    }
    locateRequestedRef.current = true;
    setLocating(true);
    setGeoMsg(null);
    requestSharedGeolocation();
  };

  // Reframe the whole county. Shared by the dock's Where control and the
  // map-surface reset FAB so "get me un-lost" is one tap from either place,
  // not buried three levels into Filters. cameraIntentRef stays false: this is
  // a return to the default frame, not a user pan the leash should preserve.
  const fitCounty = () => {
    setResultScope("county");
    if (getScope() !== "county") setScope("county");
    if (isBrowseMap) {
      replaceMapUrl((params) => params.delete(SCOPE_PARAM));
    }
    cameraIntentRef.current = false;
    setShowResultsHere(false);
    manualViewportGestureRef.current = false;
    cameraControlGestureRef.current = false;
    // The control is the user's explicit return to overview. Hide it
    // immediately instead of leaving a seemingly broken button on-screen for
    // the duration of Mapbox's camera animation.
    setOffOverview(false);
    mapRef.current?.getMap().fitBounds(FREDERICK_COUNTY_BOUNDS, {
      padding: countyFitPadding(),
      duration: prefersReducedMotion() ? 0 : 900,
      easing: CAM_EASE,
      essential: true,
    });
  };

  // Per-event Frederick hour-of-day + day key, derived once from the events
  // prop (deterministic over fixed timestamps). The scrubber filters same-day
  // events to those live/soon at the chosen hour; other-day events stay put so
  // a weekend event isn't hidden while scrubbing today.
  const eventScrubTimes = useMemo(() => buildEventScrubTimes(events), [events]);
  const scrubTodayKey = easternDayKey(new Date());
  const visibleEvents =
    scrubHour == null
      ? events
      : events.filter((_, i) => {
          const t = eventScrubTimes[i];
          if (!t || t.dayKey !== scrubTodayKey) return true;
          return withinScrubWindow(t.startH, t.endH, scrubHour);
        });
  const inViewEvents = useMemo(
    () => visibleEvents.filter((event) => eventSlugsInView.has(event.slug)),
    [eventSlugsInView, visibleEvents],
  );

  // The finding engine reads only the entities already authorized for this
  // map payload. It joins them deterministically around the current viewport
  // (or the device fix when one is available) and suppresses thin one-fact
  // results, so Highlights never becomes a second generic directory.
  const discoveries = useMemo(
    () => viewBounds && viewCenter ? buildMapDiscoveries({
      places: inViewPlaces,
      events: inViewEvents,
      amenities,
      parking,
      transitStops,
      cemeteries,
      aerialPhotos: AERIAL_PHOTOS,
      origin: viewCenter,
      bounds: {
        west: viewBounds.w,
        east: viewBounds.e,
        south: viewBounds.s,
        north: viewBounds.n,
      },
      now: new Date(discoveryClockMs),
      limit: 6,
    }) : [],
    [amenities, cemeteries, discoveryClockMs, inViewEvents, inViewPlaces, parking, transitStops, viewBounds, viewCenter],
  );
  // A camera move caused by a finding can slightly change the ranked viewport
  // set. Keep the selected card in the swipe deck until the user closes it.
  const discoveryDeck = useMemo(
    () => selectedDiscovery && !discoveries.some((item) => item.id === selectedDiscovery.id)
      ? [selectedDiscovery, ...discoveries]
      : discoveries,
    [discoveries, selectedDiscovery],
  );
  const selectedDiscoveryIndex = selectedDiscovery
    ? discoveryDeck.findIndex((item) => item.id === selectedDiscovery.id)
    : -1;

  const showDiscovery = (discovery: MapDiscovery) => {
    openMapSelection({ kind: "discovery", value: discovery });
    const map = mapRef.current?.getMap();
    if (map) {
      cameraIntentRef.current = true;
      map.easeTo({
        center: discovery.center,
        zoom: Math.max(map.getZoom(), discovery.zoom),
        duration: prefersReducedMotion() ? 0 : 950,
        easing: CAM_EASE,
        essential: true,
      });
    }
  };

  const showDiscoveryAt = (index: number) => {
    if (discoveryDeck.length === 0) return;
    const normalized = (index + discoveryDeck.length) % discoveryDeck.length;
    showDiscovery(discoveryDeck[normalized]);
  };

  // One honest marker per venue cell. Every occurrence remains available in
  // the chronological drawer; the map no longer grows a radial flower of
  // overlapping 44px buttons when a venue hosts several events.
  const eventGroups = useMemo(() => groupMapEvents(visibleEvents), [visibleEvents]);

  // "Closes within the hour" — the dock's living count line. open_status
  // "closing-soon" is exactly the ≤60-minute window (getOpenStatus).
  const closingSoonCount = useMemo(
    () => inViewPlaces.filter((p) => p.open_status?.state === "closing-soon").length,
    [inViewPlaces],
  );

  // Season rows for the dock's Aerial nested strip (label + count per
  // season, from the manifest).
  const aerialSeasonItems = useMemo(
    () =>
      AERIAL_SEASONS.map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        count: s.key === "all" ? AERIAL_PHOTOS.length : (AERIAL_SEASON_COUNTS[s.key] ?? 0),
      })),
    [],
  );

  const orderedLiveIncidents = useMemo(
    () =>
      [...liveIncidents].sort(
        (a, b) =>
          Date.parse(b.lastReportedAt) - Date.parse(a.lastReportedAt),
      ),
    [liveIncidents],
  );
  const recentIncidentCount = useMemo(
    () =>
      orderedLiveIncidents.filter(
        (incident) => {
          const ageMs =
            discoveryClockMs - Date.parse(incident.lastReportedAt);
          return ageMs >= 0 && ageMs <= 60 * 60_000;
        },
      ).length,
    [discoveryClockMs, orderedLiveIncidents],
  );
  const latestIncidentSummary = useMemo(() => {
    const incident = orderedLiveIncidents[0];
    if (!incident) return null;
    const minutesAgo = Math.max(
      0,
      Math.round(
        (discoveryClockMs - Date.parse(incident.lastReportedAt)) / 60_000,
      ),
    );
    return {
      id: incident.id,
      kind: incident.kind,
      location: incident.location,
      sourceLabel:
        incident.status === "corroborated"
          ? "Frederick Scanner + MDOT CHART"
          : "Frederick Scanner",
      ageLabel:
        minutesAgo < 1
          ? "just now"
          : minutesAgo < 60
            ? `${minutesAgo} min ago`
            : `${Math.round(minutesAgo / 60)}h ago`,
    };
  }, [discoveryClockMs, orderedLiveIncidents]);
  const edgeOverlayState: MapEdgeOverlayState = {
    incidents: showIncidents,
    aviation: showRotorcraft,
    traffic: showTraffic,
    radar: showRadar,
    parking: showParking,
    transit: showTransit,
    trails: showTrails,
    cameras: showCameras,
    aerial: showAerial,
  };
  const toggleEdgeOverlay = (
    id: MapEdgeOverlayId,
    next: boolean,
  ) => {
    wakeMapEdgeTools();
    haptic("light");
    track("map_edge_tool", { tool: id, on: next });
    switch (id) {
      case "incidents":
        setShowIncidents(next);
        break;
      case "aviation":
        setShowRotorcraft(next);
        break;
      case "traffic":
        setShowTraffic(next);
        break;
      case "radar":
        setShowRadar(next);
        break;
      case "parking":
        setShowParking(next);
        break;
      case "transit":
        setShowTransit(next);
        break;
      case "trails":
        setShowTrails(next);
        break;
      case "cameras":
        setShowCameras(next);
        break;
      case "aerial":
        setShowAerial(next);
        break;
    }
  };
  const focusIncidentFromEdge = (id: string) => {
    const incident = orderedLiveIncidents.find((item) => item.id === id);
    if (!incident) return;
    setShowIncidents(true);
    setFocusedIncidentId(id);
    cameraIntentRef.current = true;
    mapRef.current?.getMap().easeTo({
      center: [incident.coordinate.lng, incident.coordinate.lat],
      zoom: 14.5,
      duration: prefersReducedMotion() ? 0 : 800,
      easing: CAM_EASE,
      essential: true,
    });
  };

  return (
    <div
      className={
        fullBleed
          ? `relative h-full w-full overflow-hidden${dock ? " dock-host" : ""}`
          : "relative overflow-hidden rounded-[var(--app-radius-lg)] border"
      }
      data-dock-pane={dock ? (dockPaneOpen ? "open" : "closed") : undefined}
      data-map-peek={dock && selectionOpen ? "open" : undefined}
      data-map-error={mapError || undefined}
      data-map-loaded={dock && mapLoaded ? "true" : undefined}
      data-map-location-accuracy={
        dock && userLoc && clampedAccuracyM ? clampedAccuracyM : undefined
      }
      data-map-place-marks={dock ? placeMarksHealth : undefined}
      data-map-amenity-marks={dock ? amenityMarksHealth : undefined}
      data-flood-context-count={dock ? floodContext.features.length : undefined}
      style={fullBleed ? undefined : { borderColor: "var(--app-border)", height }}
      onPointerDownCapture={(event) => {
        wakeMapEdgeTools();
        const target = event.target as Element;
        if (target.closest(".mapboxgl-canvas-container, .mapboxgl-ctrl")) {
          cameraIntentRef.current = true;
        }
        if (
          target.closest(
            ".mapboxgl-ctrl-zoom-in, .mapboxgl-ctrl-zoom-out, .mapboxgl-ctrl-compass",
          )
        ) {
          cameraControlGestureRef.current = true;
        }
        if (dockPaneOpen && target.closest(".mapboxgl-canvas-container")) {
          window.dispatchEvent(new Event("fr:map-gesture"));
        }
      }}
      onPointerMoveCapture={wakeMapEdgeTools}
      onFocusCapture={wakeMapEdgeTools}
      onKeyDownCapture={(event) => {
        wakeMapEdgeTools();
        const target = event.target as Element;
        if (
          target.closest(".mapboxgl-canvas") &&
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "=", "-"].includes(
            event.key,
          )
        ) {
          cameraControlGestureRef.current = true;
        }
      }}
      onWheelCapture={() => {
        cameraIntentRef.current = true;
        cameraControlGestureRef.current = true;
        wakeMapEdgeTools();
      }}
    >
      {/* ── The search bar. On /map browse it's FOLDED INTO the dock's top
          row (MapDock) so there is one instrument and one map-search; the
          floating bar renders only on dock-less embeds (SavedList's map),
          where it also keeps its locate icon. ── */}
      {!dock && showSearchControls && (
        <AppMapDeck
          q={q}
          setQ={setQ}
          searchMatches={searchMatches}
          pickSearch={pickSearch}
          goNearMe={goNearMe}
          locating={locating}
          userLoc={userLoc}
        />
      )}

      {/* Living-map time scrubber. On /map browse it lives INSIDE the
          dock's When pane ("The day"); the floating card remains only
          for dock-less full-bleed maps so nothing regresses there. */}
      {fullBleed && !dock && events.length > 0 && (
        <TimeScrubber floating hour={scrubHour} onChange={setScrubHour} />
      )}

        {mapError && (
          <section
            className="map-error-fallback"
            aria-labelledby="map-error-title"
          >
            <div className="map-error-fallback-head" role="alert">
              <div>
                <h2
                  id="map-error-title"
                  className="font-sans text-base font-semibold"
                  style={{ color: "var(--app-ink)" }}
                >
                  {mapUnsupported
                    ? "This browser cannot draw the map"
                    : "The map is temporarily unavailable"}
                </h2>
                <p
                  className="mt-1 max-w-xl text-xs leading-relaxed"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {mapUnsupported
                    ? "The same places and events are available below in a readable list."
                    : "Your current results are still available below. Reload the map when you are ready."}
                </p>
              </div>
              <div className="map-error-fallback-actions">
                {!mapUnsupported && (
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="tap-44 inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--app-bg-sunken)]"
                    style={{
                      borderColor: "var(--app-border)",
                      color: "var(--app-ink-2)",
                    }}
                  >
                    Reload map
                  </button>
                )}
                <Link
                  href="/places"
                  className="tap-44 inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-semibold text-white"
                  style={{ background: "var(--app-brand-press)" }}
                >
                  All places
                </Link>
              </div>
            </div>
            <MapList
              places={inViewPlaces}
              events={visibleEvents}
              userLoc={userLoc}
              sortOrigin={viewCenter ?? searchFallbackOriginRef.current}
              onPick={openPlaceSheet}
              onPickEvent={(event) => router.push(`/events/${event.slug}`)}
            />
          </section>
        )}
        {/* A geolocation denial or failure has to be visible where the user
            just tapped locate. On the dock surface it anchors above the locate
            FAB (bottom-right); dock-less embeds keep the centered toast. Before,
            it was gated to the no-dock case only, so on /map browse a denial
            was silent (it lived inside the collapsed Where pane). */}
        {geoMsg && (
          <div
            className={`z-[var(--z-map-control)] flex items-center gap-1 rounded-[var(--app-radius-md)] border bg-white/95 py-1 pl-3 pr-1 text-[11px] font-medium shadow-[var(--app-shadow-1)] backdrop-blur ${
              dock ? "map-geo-toast" : "absolute bottom-3 left-1/2 -translate-x-1/2"
            }`}
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
          >
            <span role="status" aria-live="polite">{geoMsg}</span>
            <button
              type="button"
              className="tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--app-bg-sunken)]"
              onClick={() => setGeoMsg(null)}
              aria-label="Dismiss location message"
              style={{ color: "var(--app-ink-3)" }}
            >
              <X className="h-4 w-4" strokeWidth={2.3} aria-hidden />
            </button>
          </div>
        )}
        {/* Transient OSM status only — loading + error. The old steady-state
            "{N} verified OSM places" chip was a permanent floating count with
            no tap target (pure top-left noise once everything had loaded), so
            on a healthy map nothing shows here now. */}
        {(osmLoading || osmError) && (
          <div
            className={`absolute left-3 z-[var(--z-map-control)] inline-flex items-center gap-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium shadow-[var(--app-shadow-1)] backdrop-blur ${
              dock ? "top-[168px]" : "top-3"
            }`}
            style={{ color: "var(--app-ink-2)" }}
            aria-live="polite"
          >
            {osmLoading ? (
              <>
                <span className="inline-block h-2 w-2 animate-pulse rounded-full motion-reduce:animate-none" style={{ background: "var(--app-cool)" }} />
                Loading public places from OpenStreetMap…
              </>
            ) : (
              <>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--app-warning)" }} />
                Couldn&apos;t reach OSM; showing curated only
              </>
            )}
          </div>
        )}
        {/* Directions chip — distance + drive estimate + native handoff */}
        {routeInfo && (
          <div
            className="map-route-chip-wrap absolute inset-x-0 z-[var(--z-map-control)] flex justify-center px-3"
            data-map-top-surface="route"
          >
            <a
              href={routeInfo.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => haptic("light")}
              // Capped so a long venue name can't stretch the chip into the
              // top-right zoom controls; the name itself truncates within it.
              className="map-top-action inline-flex max-w-[calc(100%-7rem)] items-center gap-2 px-3.5 text-[12px] font-semibold"
              style={{ borderColor: "var(--app-border)", background: "rgba(255,255,255,0.95)", color: "var(--app-ink-2)" }}
            >
              <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-cool)" }} aria-hidden />
              <span className="truncate">{routeInfo.name}</span>
              <span style={{ color: "var(--app-ink-3)" }}>
                {routeInfo.dist} · {routeInfo.eta}
              </span>
              <span style={{ color: "var(--app-cool)" }}>Directions ↗</span>
            </a>
          </div>
        )}

        {/* Aerial time machine — scrub the drone archive by season. With a
            dock, the seasons nest under the Aerial photos overlay chip in
            the What pane; the floating strip serves dock-less maps only. */}
        {visibleAerial && !dock && (
          <div
            className="absolute bottom-[116px] left-1/2 z-[var(--z-map-control)] flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border px-1.5 py-1.5 shadow-[var(--app-shadow-2)] backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ borderColor: "var(--app-border)", background: "rgba(255,255,255,0.95)" }}
            role="group"
            aria-label="Aerial photos by season"
          >
            {AERIAL_SEASONS.map((s) => {
              const on = aerialSeason === s.key;
              const count = s.key === "all" ? AERIAL_PHOTOS.length : (AERIAL_SEASON_COUNTS[s.key] ?? 0);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { setAerialSeason(s.key); haptic("light"); }}
                  aria-pressed={on}
                  className="tap-44-y inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition active:scale-[0.96]"
                  style={{ background: on ? s.color : "transparent", color: on ? "#fff" : "var(--app-ink-2)" }}
                >
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: on ? "#fff" : s.color }} />
                  {s.label}
                  {on && <span className="tabular-nums font-medium" style={{ opacity: 0.85 }}>{count}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Legend retired — the floating button competed with the map
            and never carried real signal. The category color band on
            each pin + the in-view drawer's place cards are the legend
            now. */}

        <p id="frederick-map-help" className="sr-only">
          Interactive map of Frederick County. Use arrow keys to pan and plus
          or minus to zoom when the map has focus. Use Browse to find nearby
          places, check today and tonight, see conditions, or add Frederick details.
        </p>

        <Map
          ref={attachMapRef}
          aria-label="Interactive map of Frederick County"
          aria-describedby="frederick-map-help"
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={
            urlCamera ?? (locationSeed.camera
              ? {
                  longitude: locationSeed.camera.lng,
                  latitude: locationSeed.camera.lat,
                  zoom: initialZoom,
                }
              : initialBounds
              ? {
                  bounds: initialBounds,
                  fitBoundsOptions: { padding: initialCountyPadding },
                }
              : {
                  longitude: effectiveCenter[0],
                  latitude: effectiveCenter[1],
                  zoom: initialZoom,
                })
          }
          mapStyle={mapStyleWithStandardPreview(
            MAP_BAKED_STYLE
              ? (BAKED_STYLE as unknown as StyleSpecification)
              : STYLE_URL,
            routeSearch,
          )}
          style={{ width: "100%", height: "100%" }}
          attributionControl={false}
          // ── Mobile-smoothness flags ──
          // This is a flat 2D county map: rotation and pitch only ever
          // happen by accident on a two-finger pan, leaving the user
          // staring at a tilted, spun map they can't easily un-tilt.
          // Locking both keeps every gesture a clean pan/zoom.
          dragRotate={false}
          pitchWithRotate={false}
          touchPitch={false}
          // Leash the camera to the county (+ buffer) so flings don't
          // sail off into empty tiles the user then has to scroll back
          // from — and so the place set always has context on screen.
          // A 235px-high landscape phone needs a wider camera footprint than
          // any useful local pan leash permits. The fit bounds + 6.8 floor keep
          // the county visible there; portrait/desktop retain the browse leash.
          maxBounds={shortLandscapeViewport ? undefined : cameraMaxBounds}
          minZoom={cameraMinZoom}
          maxZoom={FREDERICK_MAX_ZOOM}
          // Don't tear down + re-create the GL context when the map
          // unmounts (mode toggle, route change) — reusing it makes the
          // map snap back instantly instead of cold-booting Mapbox.
          reuseMaps
          // Snappier label transitions on pan/zoom (default is 300ms).
          fadeDuration={120}
          // The terrain/fog combo we previously had assumed Standard's
          // built-in mapbox-dem source. On dark-v11 that source isn't
          // included, so terrain silently no-ops; applyFrederickPalette
          // installs its OWN raster-dem source (fr-dem) and a hillshade
          // LAYER that paints relief over the Catoctin + South Mountain
          // ridges. The result reads as terrain-aware without the cost
          // of a 3D mesh, and keeps wayfinding crisp at every zoom.
          interactiveLayerIds={[
            "clusters",
            ...(curatedClusters ? ["curated-clusters"] : []),
            "osm-icons",
            "amenity-clusters",
            "amenity-icons",
            "curated-icons",
            "curated-active-icons",
            "curated-hit",
            "aerial-icons",
            "cemetery-icons",
            "transit-stop-hit",
            "marc-station-pins",
            "marc-station-hit",
            "muni-label",
          ]}
          onMoveStart={(e) => {
            const isUserMove =
              Boolean((e as { originalEvent?: unknown }).originalEvent) ||
              cameraControlGestureRef.current;
            // Mapbox can emit dragstart just before movestart. Preserve that
            // positive user signal when movestart itself omits originalEvent.
            if (isUserMove) {
              manualViewportGestureRef.current = true;
            } else if (!manualViewportGestureRef.current) {
              setShowResultsHere(false);
            }
          }}
          onDragStart={() => {
            manualViewportGestureRef.current = true;
          }}
          onZoomStart={(e) => {
            if (
              Boolean((e as { originalEvent?: unknown }).originalEvent) ||
              cameraControlGestureRef.current
            ) {
              manualViewportGestureRef.current = true;
            }
          }}
          onClick={onClick}
          onLoad={(e) => {
            edgeToolsLastWakeRef.current = Number.NEGATIVE_INFINITY;
            wakeMapEdgeTools();
            // `reuseMaps` can retain the camera from a prior visit even when
            // this route has an explicit return/share camera. Restore it
            // before any settled move is allowed to rewrite `?c=`.
            if (urlCamera) {
              cameraUrlWriteReadyRef.current = false;
              const center = e.target.getCenter();
              const alreadyRestored =
                Math.abs(center.lng - urlCamera.longitude) < 0.00005 &&
                Math.abs(center.lat - urlCamera.latitude) < 0.00005 &&
                Math.abs(e.target.getZoom() - urlCamera.zoom) < 0.005;
              if (!alreadyRestored) {
                cameraIntentRef.current = true;
                e.target.jumpTo({
                  center: [urlCamera.longitude, urlCamera.latitude],
                  zoom: urlCamera.zoom,
                });
              } else {
                cameraUrlWriteReadyRef.current = true;
              }
            }
            installCategoryMarkers(e.target);
            // Brand repaint. The palette rewrites stock light-v11 into the
            // Frederick Radius design — paper-cream land, civic-blue water,
            // suppressed POI clutter (our own pins are the points of
            // interest), warm hillshade across the Catoctin + South Mountain
            // ridges. This is the difference between "Mapbox light style" and
            // "Frederick Radius map."
            //
            // Two paths: the baked style (flag on) already carries the palette
            // as static JSON, so we skip the ~50-layer runtime walk and only
            // install the two things the JSON can't hold — the hillshade relief
            // (a live raster-dem source) and the county spotlight. Flag off
            // keeps the proven runtime recolor.
            if (standardPreview) {
              applyMapboxStandardPreviewConfig(e.target, {
                search: routeSearch,
              });
            } else if (MAP_BAKED_STYLE) {
              installRelief(e.target);
            } else {
              applyFrederickPalette(e.target);
            }
            // Frame browse mode in the county too, the same veil + drawn
            // border the radius map already wears, so the two modes feel
            // like one place and not two different maps.
            installCountySpotlight(e.target);
            markMapOnLoad();
            commitResultViewport(e.target);
            setMapLoaded(true);
            // `load` means Mapbox has a renderable style. Waiting for a later
            // network-idle event kept the decorative loading cover over an
            // already usable map, especially on slow live feeds. Two paint
            // frames give the canvas time to appear, while onIdle remains a
            // fallback for browsers that throttle animation frames.
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => onVisualReady?.());
            });
            // A restored `?c=` camera can open already zoomed in without ever
            // firing moveend, so seed the reset FAB's visibility from the
            // initial frame too.
            setOffOverview(!isCountyOverview(e.target));
            if (
              !deepLinkAmenityAppliedRef.current &&
              initialAmenityGroups?.length &&
              initialBounds &&
              !urlCamera &&
              !recenterToKnownLocation &&
              amenityGeoJson.features.length > 0
            ) {
              deepLinkAmenityAppliedRef.current = true;
              const coordinates = amenityGeoJson.features.map(
                (feature) => feature.geometry.coordinates as [number, number],
              );
              const lngs = coordinates.map(([lng]) => lng);
              const lats = coordinates.map(([, lat]) => lat);
              cameraIntentRef.current = true;
              e.target.fitBounds(
                [
                  [Math.min(...lngs), Math.min(...lats)],
                  [Math.max(...lngs), Math.max(...lats)],
                ],
                {
                  padding: countyFitPadding(),
                  maxZoom: 14,
                  duration: 0,
                },
              );
            }
            if (!deepLinkPlaceAppliedRef.current && initialPlaceSlug) {
              deepLinkPlaceAppliedRef.current = true;
              const place = places.find((candidate) => candidate.slug === initialPlaceSlug);
              if (place) {
                openMapSelection({ kind: "place", value: place });
              }
            }
            if (
              !deepLinkEventAppliedRef.current &&
              initialEventSlug &&
              !initialPlaceSlug
            ) {
              deepLinkEventAppliedRef.current = true;
              const event = events.find(
                (candidate) => candidate.slug === initialEventSlug,
              );
              if (event) {
                openMapSelection({ kind: "event", value: event });
                if (!urlCamera) {
                  cameraIntentRef.current = true;
                  smoothFocus(e.target, [event.lng, event.lat], {
                    minZoom: 14,
                    maxStep: 6,
                  });
                }
              }
            }
            // Do not normalize selection params until the initial deep link
            // above has had a chance to hydrate its card or event.
            setSelectionUrlReady(true);
          }}
          onIdle={(e) => {
            onVisualReady?.();
            if (!dock) return;
            if (places.length > 0 && placeMarksHealth !== "ready") {
              try {
                const markLayers = [
                  ...(curatedClusters ? ["curated-clusters"] : []),
                  "curated-dots",
                  "curated-icons",
                ].filter((layer) => Boolean(e.target.getLayer(layer)));
                const hasLayers =
                  Boolean(e.target.getLayer("curated-dots")) &&
                  Boolean(e.target.getLayer("curated-icons")) &&
                  (!curatedClusters || Boolean(e.target.getLayer("curated-clusters")));
                const visibleMarks = hasLayers
                  ? e.target.queryRenderedFeatures({
                      layers: markLayers,
                    }).length
                  : 0;
                setPlaceMarksHealth(
                  hasLayers && visibleMarks > 0 ? "ready" : "missing",
                );
              } catch {
                setPlaceMarksHealth("missing");
              }
            }
            if (
              amenityGroups.size > 0 &&
              amenityMarksHealth !== "ready"
            ) {
              try {
                const hasLayers =
                  Boolean(e.target.getLayer("amenity-clusters")) &&
                  Boolean(e.target.getLayer("amenity-icons"));
                const visibleMarks = hasLayers
                  ? e.target.queryRenderedFeatures({
                      layers: ["amenity-clusters", "amenity-icons"],
                    }).length
                  : 0;
                setAmenityMarksHealth(
                  hasLayers && visibleMarks > 0 ? "ready" : "missing",
                );
              } catch {
                setAmenityMarksHealth("missing");
              }
            }
          }}
          onMoveEnd={(e) => {
            markMapIdleOnce();
            // The reset FAB only earns its place once zoom or pan has clipped
            // the county overview (see offOverview).
            setOffOverview(!isCountyOverview(e.target));
            const c = e.target.getCenter();
            if (urlCamera && !cameraUrlWriteReadyRef.current) {
              const restored =
                Math.abs(c.lng - urlCamera.longitude) < 0.00005 &&
                Math.abs(c.lat - urlCamera.latitude) < 0.00005 &&
                Math.abs(e.target.getZoom() - urlCamera.zoom) < 0.005;
              if (!restored) return;
              cameraUrlWriteReadyRef.current = true;
            }

            const viewport = readResultViewport(e.target);
            if (!viewport) return;
            syncCameraViewport(viewport);

            if (
              dock &&
              manualViewportGestureRef.current &&
              resultViewportChanged(committedResultViewportRef.current, viewport)
            ) {
              setShowResultsHere(true);
              manualViewportGestureRef.current = false;
              cameraControlGestureRef.current = false;
              return;
            }

            // Initial/restored cameras, Locate, Whole County, search picks, and
            // selected pins all commit immediately. A tiny finger wobble that
            // stayed inside the committed result area does the same.
            commitResultViewport(e.target, { writeUrl: true });
          }}
          onError={(e) => {
            const msg = String(e?.error?.message ?? "");
            if (/access token|unauthorized|forbidden|\b40[13]\b|failed to (fetch|load)|\bsprite\b.*(?:failed|404|not found)|(?:failed|404).*\bsprite\b/i.test(msg)) {
              setMapError(true);
              onVisualReady?.();
            }
          }}
          onMouseMove={onHover}
          onMouseLeave={() => setHover(null)}
        >
          {/* Required Mapbox/OSM credits, collapsed to the compact ⓘ badge
              (permitted by Mapbox ToS) so the text never sits on the map. */}
          <AttributionControl compact position="bottom-right" />
          {spotSelection && (
            <Marker
              longitude={spotSelection.lng}
              latitude={spotSelection.lat}
              anchor="center"
            >
              <span
                aria-hidden
                className="block h-5 w-5 rounded-full border-[3px] border-white"
                style={{
                  background: "var(--app-cool)",
                  boxShadow: "0 2px 10px rgba(34, 28, 21, 0.28)",
                }}
              />
            </Marker>
          )}
          {/* (Removed an orphaned mapbox-dem raster-dem Source: there is no
              `terrain` prop on <Map> — see the note above — and
              applyFrederickPalette installs its own `fr-dem` source + hillshade,
              so this was a duplicate terrain-DEM tile pyramid with no consumer.) */}
          {/* Municipality labels use semantic zoom on the full county map:
              larger communities orient the broad view, mid-sized towns join
              next, and the smallest labels wait until town zoom. Compact and
              embedded maps keep the prior all-town behavior. */}
          <Source id="muni-labels" type="geojson" data={muniLabelsGeoJson}>
            <Layer
              id="muni-label"
              type="symbol"
              minzoom={7.25}
              maxzoom={13.5}
              layout={{
                "text-field": dock
                  ? [
                      "step",
                      ["zoom"],
                      ["case", ["==", ["get", "labelPriority"], 0], ["get", "name"], ""],
                      8.6,
                      ["case", ["<=", ["get", "labelPriority"], 1], ["get", "name"], ""],
                      10,
                      ["get", "name"],
                    ]
                  : ["get", "name"],
                "text-size": ["interpolate", ["linear"], ["zoom"], 7.25, 9.5, 10, 11, 13, 12],
                "text-letter-spacing": 0.08,
                "text-transform": "uppercase",
                "text-anchor": "center",
                "text-allow-overlap": false,
                "text-ignore-placement": false,
                "text-padding": dock ? 6 : 2,
                "symbol-sort-key": dock ? ["get", "labelPriority"] : 0,
              }}
              paint={{
                "text-color": "#7A7975",
                "text-halo-color": "#FAFAF7",
                "text-halo-width": 1.8,
              }}
            />
          </Source>

          {/* Animated weather radar — raster frames slotted BENEATH the
              muni labels via beforeId, so precipitation drapes the basemap
              but never covers a line, pin, or label. */}
          <WeatherRadar
            show={showRadar}
            beforeId="muni-label"
            onNewestFrame={setRadarFrameEpoch}
            onHealth={setRadarHealth}
          />
          {showRadar ? (
            <LightningDensity show beforeId="muni-label" />
          ) : null}

          {/* Current congestion is context, not the closure authority. It
              sits below the incident/camera pins; the dock keeps Maryland
              CHART and Radius's public incident feed visibly distinct. */}
          <MapboxTraffic show={showTraffic} />

          {/* Static high-water areas and warning infrastructure are context,
              never a live flood claim. They share the Roads view and sit
              beneath current work-zone and incident geometry. */}
          {showTraffic ? <FloodContext show data={floodContext} gate={liveLayerGate} /> : null}

          {/* SnowCommand reports route operations, not moving plows or road
              safety. Current reports share the Roads view so winter context
              never adds another primary map control. */}
          {showTraffic ? <SnowRoutes show data={snowRoutes} gate={liveLayerGate} /> : null}

          {/* Official lane-level roadwork belongs to Traffic, not another
              switch. A wide transparent hit line makes the geometry easy to
              inspect on a phone without covering congestion or incident pins. */}
          {showTraffic ? <RoadWorkZones show data={roadWorkZones} gate={liveLayerGate} /> : null}

          {/* Live public scanner incidents — caution pins (crashes, wires
              down, fires) that self-refresh and age out. Empty until the
              FredScanner feed is configured; polls only while its toggle is on. */}
          <LiveIncidents
            show={showIncidents}
            probe={Boolean(dock)}
            onHealth={setIncidentHealth}
            onSnapshot={setLiveIncidents}
            focusIncidentId={focusedIncidentId}
            onFocusIncidentChange={setFocusedIncidentId}
            gate={liveLayerGate}
          />

          {/* Public helicopter activity. Trooper flights are county-level
              status only; possible FMH movement pulses the fixed heliport.
              Generic observations are deliberately coarse and delayed. */}
          <LiveRotorcraft
            show={showRotorcraft}
            probe={Boolean(dock)}
            onStatus={setRotorcraftStatus}
            gate={liveLayerGate}
          />

          {/* MDOT CHART traffic cameras — pinned where they are; tap to watch
              the live feed. Fetches once when the layer turns on. */}
          <TrafficCameras
            show={showCameras}
            onHealth={setCameraHealth}
          />

          {/* #3 toggleable line overlays — rendered BEFORE the point
              layers so pins sit on top. Empty (invisible) unless the
              user opts in; base map unchanged by default. */}
          <Source id="transit-lines" type="geojson" data={(visibleTransit ? transitLines : EMPTY_LINE_FC) as unknown as GeoJSON.FeatureCollection}>
            <Layer
              id="transit-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "#285D73",
                "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 14, 3, 17, 5],
                "line-opacity": 0.75,
              }}
            />
          </Source>
          {/* Bus stops + MARC stations (phase 3) — the other half of the
              Transit layer: where you actually catch the thing. Stops are
              zoom-gated dots (names at street zoom); MARC stations always
              draw when the layer is on, and tapping one shows the next
              scheduled trains. */}
          <Source
            id="transit-stops"
            type="geojson"
            data={{
              type: "FeatureCollection",
              features: visibleTransit
                ? transitStops.map((st) => ({
                    type: "Feature" as const,
                    geometry: { type: "Point" as const, coordinates: [st.lng, st.lat] },
                    properties: { id: st.id, name: st.name },
                  }))
                : [],
            }}
          >
            <Layer
              id="transit-stop-dots"
              type="circle"
              minzoom={12.5}
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 12.5, 2, 16, 4.5],
                "circle-color": "#285D73",
                "circle-opacity": 0.85,
                "circle-stroke-width": 1,
                "circle-stroke-color": "#F4EEE2",
              }}
            />
            <Layer
              id="transit-stop-hit"
              type="circle"
              minzoom={12.5}
              paint={{
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  12.5, 9,
                  13, 12,
                  16, 18,
                ],
                "circle-color": "#285D73",
                "circle-opacity": 0,
              }}
            />
            <Layer
              id="transit-stop-names"
              type="symbol"
              minzoom={15}
              layout={{
                "text-field": ["get", "name"],
                "text-size": 10,
                "text-offset": [0, 1.1],
                "text-anchor": "top",
                "text-optional": true,
              }}
              paint={{ "text-color": "#285D73", "text-halo-color": "#F4EEE2", "text-halo-width": 1 }}
            />
          </Source>
          <Source
            id="marc-stations"
            type="geojson"
            data={{
              type: "FeatureCollection",
              features: visibleTransit
                ? marcStations.map((st) => ({
                    type: "Feature" as const,
                    geometry: { type: "Point" as const, coordinates: [st.lng, st.lat] },
                    properties: { name: st.name },
                  }))
                : [],
            }}
          >
            <Layer
              id="marc-station-pins"
              type="circle"
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 8],
                "circle-color": "#5A4FCF",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#F4EEE2",
              }}
            />
            <Layer
              id="marc-station-hit"
              type="circle"
              paint={{
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  9, 14,
                  12, 18,
                  16, 22,
                ],
                "circle-color": "#5A4FCF",
                "circle-opacity": 0,
              }}
            />
            <Layer
              id="marc-station-names"
              type="symbol"
              minzoom={10}
              layout={{
                "text-field": ["concat", "MARC · ", ["get", "name"]],
                "text-size": 11,
                "text-offset": [0, 1.2],
                "text-anchor": "top",
                "text-optional": true,
              }}
              paint={{ "text-color": "#3F3894", "text-halo-color": "#F4EEE2", "text-halo-width": 1.2 }}
            />
          </Source>
          {/* Live vehicles and route lines are one honest Transit layer. The
              old always-on vehicles made the dock say "No layers" while buses
              were visibly moving on the map. */}
          <LiveBuses show={visibleTransit} gate={liveLayerGate} />
          {/* MARC trains ride the SAME Transit toggle — one honest layer.
              DOM markers sit above the canvas, so a train at Point of Rocks
              never hides beneath its marc-station pin. */}
          <LiveMarcTrains show={visibleTransit} gate={liveLayerGate} />
          <Source id="trail-lines" type="geojson" data={(showTrails ? trailLines : EMPTY_LINE_FC) as unknown as GeoJSON.FeatureCollection}>
            <Layer
              id="trail-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                // Color by surface so the network reads at a glance: green =
                // paved (bikes, strollers, wheelchairs), ochre = unpaved dirt
                // trail, muted when the county didn't record a surface.
                "line-color": [
                  "match",
                  ["get", "paved"],
                  "paved", "#315A43",
                  "unpaved", "#B4712A",
                  "#6E6552",
                ],
                "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 14, 2.8, 17, 4.5],
                "line-opacity": 0.8,
              }}
            />
          </Source>
          {/* GIS overlays (6.3/6.4): parks, farmers markets, public art.
              Self-contained (lazy fetch, own Sources/Layers, own click
              popups) so this block stays out of the main render path. */}
          <MapOverlays active={activeOverlays} />
          {/* County boundary — the quiet always-on county edge (6.1).
              Committed static GIS polygon, drawn as an outline UNDER the
              municipal lines and pins so the map reads as a county field
              guide. Colored in Forest (brand-2 #315A43, "deep county green")
              rather than warm ink-2 (#5A5348), which read as a muddy brown line
              at low opacity over the cream ground — an intentional green
              territorial edge, not an accidental brown one. GL can't read CSS
              vars, so the token value is inlined (documented paint exception). */}
          <Source
            id="county-boundary"
            type="geojson"
            data={countyBoundary as unknown as GeoJSON.FeatureCollection}
          >
            <Layer
              id="county-boundary-line"
              type="line"
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{
                "line-color": "#315A43",
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.2, 13, 2 ],
                "line-opacity": 0.45,
              }}
            />
          </Source>
          {/* Municipal boundaries — authoritative county GIS polygons,
              rendered as a quiet always-on outline so a user can see
              which town they are panning through (replacing the old
              centroid-label-only orientation). Drawn BELOW the place
              pins, low opacity, so it orients without competing. */}
          <Source
            id="municipal-boundaries"
            type="geojson"
            data={municipalBoundaries as unknown as GeoJSON.FeatureCollection}
          >
            <Layer
              id="municipal-boundary-line"
              type="line"
              layout={{ "line-join": "round" }}
              paint={{
                "line-color": "#5C5A50",
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 13, 1.4],
                "line-opacity": 0.22,
                "line-dasharray": [3, 2],
              }}
            />
            {/* Tap-a-town highlight: the tapped municipality's outline
                lights up in brand cool and fades in (opacity transition)
                as the civic sheet rises. Filtered to nothing when closed. */}
            <Layer
              id="municipal-boundary-highlight"
              type="line"
              layout={{ "line-join": "round", "line-cap": "round" }}
              filter={["==", ["get", "slug"], civicTown?.slug ?? "__none__"]}
              paint={{
                "line-color": "#285D73",
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 13, 3.5],
                "line-opacity": civicTown ? 0.9 : 0,
                "line-opacity-transition": { duration: aerialFade, delay: 0 },
              }}
            />
          </Source>

          {/* Tap-a-town civic sheet — "you're in {town}", the key contacts
              (town hall, trash, ...) and a link to the town guide. Resolved
              by point-in-polygon in onClick; honest when a town has no
              civic record yet. */}
          {civicTown && (!dock || !compactMapViewport) && (() => {
            const muni =
              MUNICIPALITIES.find((municipality) => municipality.slug === civicTown.slug) ??
              null;
            const rec = muni ? municipalCivicFor(muni.slug) : null;
            const contacts = rec ? civicContacts(rec).slice(0, 2) : [];
            const title = muni?.name ?? civicTown.name;
            return (
              <Popup
                longitude={civicTown.lng}
                latitude={civicTown.lat}
                offset={14}
                closeOnClick={false}
                onClose={clearMapSelection}
                maxWidth="250px"
              >
                <div style={{ padding: "2px 2px 4px", minWidth: 198 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--app-cool, #285D73)", margin: 0 }}>
                    You&rsquo;re in
                  </p>
                  <strong className="font-serif" style={{ display: "block", fontSize: 18, lineHeight: 1.15, color: "var(--app-ink, #221C15)", marginTop: 1 }}>
                    {title}
                  </strong>
                  {contacts.length > 0 ? (
                    <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 5 }}>
                      {contacts.map((c) => (
                        <div key={c.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                          <span style={{ color: "var(--app-ink-2, #5A5348)" }}>{c.label}</span>
                          {c.phone ? (
                            <a href={`tel:${c.phone.replace(/[^0-9]/g, "")}`} style={{ color: "var(--app-cool, #285D73)", fontWeight: 600, whiteSpace: "nowrap" }}>{c.phone}</a>
                          ) : c.website ? (
                            <a href={c.website} target="_blank" rel="noopener noreferrer" style={{ color: "var(--app-cool, #285D73)", fontWeight: 600 }}>Visit ↗</a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ marginTop: 6, fontSize: 12, color: "var(--app-ink-3, #5C5A50)" }}>
                      Civic details are not available for {title}.
                    </p>
                  )}
                  {muni && (
                    <Link href={`/m/${muni.slug}`} style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--app-brand, #B5462B)" }}>
                      {title} guide <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
                    </Link>
                  )}
                </div>
              </Popup>
            );
          })()}

          {/* OSM businesses — clustered. Calm tier: a soft cool dot that
              says "more here, zoom in", NOT a loud numbered disk. OSM is
              the secondary layer so it stays quiet and cool-toned. */}
          <Source
            id="osm-businesses"
            type="geojson"
            data={filteredOsmGeoJson}
            cluster
            clusterRadius={64}
            clusterMaxZoom={15}
          >
            {/* Soft halo — gentle depth, barely-there. */}
            <Layer
              id="cluster-glow"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": "#285D73",
                "circle-opacity": 0.14,
                "circle-blur": 1,
                "circle-radius": [
                  "interpolate", ["linear"], ["get", "point_count"],
                  2, 16, 50, 22, 300, 28,
                ],
              }}
            />
            {/* Calm core dot — soft cool tint with a count label on
                top for clusters of 4+. OSM is the secondary tier, so
                its disc stays smaller and quieter than the curated
                one above; the count just tells the user this isn't a
                3-pin pocket but a real density. */}
            <Layer
              id="clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": "#285D73",
                "circle-opacity": 0.55,
                "circle-blur": 0.25,
                "circle-radius": [
                  "interpolate", ["linear"], ["get", "point_count"],
                  2, 8, 10, 11, 50, 14, 150, 17, 400, 20,
                ],
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1,
                "circle-stroke-opacity": 0.32,
              }}
            />
            <Layer
              id="cluster-counts"
              type="symbol"
              filter={["all", ["has", "point_count"], [">=", ["get", "point_count"], 4]]}
              layout={{
                "text-field": ["get", "point_count_abbreviated"],
                "text-size": [
                  "interpolate", ["linear"], ["get", "point_count"],
                  4, 9, 50, 11, 200, 12,
                ],
                "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
              }}
              paint={{
                "text-color": "#FFFFFF",
                "text-halo-color": "rgba(0,0,0,0.3)",
                "text-halo-width": 1.1,
                "text-halo-blur": 0.4,
              }}
            />
            {/* Individual unclustered points — same icon language, smaller
                and a touch softer so curated places stay primary */}
            <Layer
              id="osm-icons"
              type="symbol"
              filter={["!", ["has", "point_count"]]}
              layout={{
                "icon-image": [
                  "coalesce",
                  ["image", ["concat", "cat-", ["get", "category"]]],
                  ["image", "cat-_default"],
                ],
                "icon-size": [
                  "interpolate", ["linear"], ["zoom"],
                  12, 0.22,
                  14, 0.3,
                  16, 0.42,
                  18, 0.54,
                ],
                // Collision declutter at every zoom (no step→true): OSM
                // is secondary, so let crowded pins hide and reveal as
                // you zoom — the "dynamic" behavior other maps have.
                "icon-allow-overlap": false,
                "icon-anchor": "center",
              }}
              paint={{ "icon-opacity": 0.8 }}
            />
          </Source>

          {/*
           * Micro-amenities. Clustered so the layer scales: at the
           * county view a downtown amenity cluster reads as one dot,
           * unfolding into individual restroom/trash/bench icons as
           * the user zooms in. Previously gated to minzoom 12 with no
           * clustering, which made selected groups *invisible* at the
           * default county view — the most common bug report. It now starts at
           * county zoom with cluster aggregation, so an explicit amenity link
           * is visible immediately instead of looking empty.
           */}
          <Source
            id="amenities"
            type="geojson"
            data={amenityGeoJson}
            cluster
            clusterRadius={48}
            clusterMaxZoom={13}
          >
            {/* Cluster disc — cool civic tint, with a count label */}
            <Layer
              id="amenity-clusters"
              type="circle"
              minzoom={7}
              filter={["has", "point_count"]}
              paint={{
                "circle-color": BRAND.colors.brick,
                "circle-opacity": 0.94,
                "circle-blur": 0,
                "circle-radius": [
                  "interpolate", ["linear"], ["get", "point_count"],
                  2, 13, 20, 18, 100, 24,
                ],
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 2.4,
                "circle-stroke-opacity": 0.9,
              }}
            />
            <Layer
              id="amenity-cluster-counts"
              type="symbol"
              minzoom={7}
              filter={["all", ["has", "point_count"], [">=", ["get", "point_count"], 3]]}
              layout={{
                "text-field": ["get", "point_count_abbreviated"],
                "text-size": 10,
                "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
              }}
              paint={{
                "text-color": "#FFFFFF",
                "text-halo-color": "rgba(0,0,0,0.3)",
                "text-halo-width": 1,
              }}
            />
            <Layer
              id="amenity-icons"
              type="symbol"
              // Share the county-level cluster floor. A lone amenity must remain
              // visible wherever a cluster would be visible.
              minzoom={7}
              filter={["!", ["has", "point_count"]]}
              layout={{
                "icon-image": [
                  "coalesce",
                  ["image", ["concat", "cat-", ["get", "category"]]],
                  ["image", "cat-_default"],
                ],
                "icon-size": [
                  "interpolate", ["linear"], ["zoom"],
                  7, 0.34,
                  10, 0.38,
                  11, 0.4,
                  13, 0.46,
                  15, 0.56,
                  17, 0.68,
                ],
                // This is an explicit user-selected layer. Never let quiet base
                // labels win collision priority and make it appear empty.
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "icon-anchor": "center",
              }}
              paint={{ "icon-opacity": 0.94 }}
            />
            {/* Labels appear only when you're really close, so a dense
                cluster of stations stays readable. */}
            <Layer
              id="amenity-labels"
              type="symbol"
              minzoom={16.5}
              layout={{
                "text-field": ["get", "name"],
                "text-size": ["interpolate", ["linear"], ["zoom"], 16.5, 9, 18, 12],
                "text-font": ["DIN Pro Regular", "Arial Unicode MS Regular"],
                "text-anchor": "top",
                "text-offset": [0, 1.05],
                "text-optional": true,
                "text-allow-overlap": false,
                "text-max-width": 8,
              }}
              paint={{
                "text-color": "#4A4A48",
                "text-halo-color": "#FAFAF7",
                "text-halo-width": 1.6,
              }}
            />
          </Source>

          {/* Curated-place semantic zoom. The county dock and compact subject
              maps start with counted clusters, then resolve to quiet dots and
              collision-aware category icons. Other embeds stay unclustered. */}
          <Source
            id="curated-places"
            type="geojson"
            data={curatedGeoJson}
            promoteId="slug"
            cluster={curatedClusters}
            clusterRadius={curatedClusterRadius}
            clusterMaxZoom={curatedClusterMaxZoom}
            clusterProperties={
              curatedClusters ? CURATED_CLUSTER_PROPERTIES : undefined
            }
          >
            {curatedClusters && (
              <Layer
                id="curated-cluster-halo"
                type="circle"
                filter={["has", "point_count"]}
                paint={{
                  "circle-color": compactSubjectMap
                    ? BRAND.colors.functionalAmber
                    : CURATED_CLUSTER_COLOR,
                  "circle-radius": compactSubjectMap
                    ? [
                        "interpolate", ["linear"], ["zoom"],
                        7, ["interpolate", ["linear"], ["get", "point_count"], 2, 18, 12, 25],
                        11.25, ["interpolate", ["linear"], ["get", "point_count"], 2, 18, 12, 25],
                        12, ["interpolate", ["linear"], ["get", "point_count"], 2, 13.3, 12, 18.5],
                      ]
                    : [
                        "interpolate", ["linear"], ["zoom"],
                        7, ["interpolate", ["linear"], ["get", "point_count"], 2, 10, 4, 13, 25, 21, 100, 27],
                        14.25, ["interpolate", ["linear"], ["get", "point_count"], 2, 10, 4, 13, 25, 21, 100, 27],
                        15, ["interpolate", ["linear"], ["get", "point_count"], 2, 7, 4, 9.1, 25, 14.7, 100, 18.9],
                      ],
                  "circle-opacity":
                    amenityLayerActive && dock ? 0.04 : 0.18,
                  "circle-blur": 0.55,
                  "circle-radius-transition": { duration: mapPaintDuration },
                  "circle-opacity-transition": { duration: mapPaintDuration },
                }}
              />
            )}
            {curatedClusters && (
              <Layer
                id="curated-clusters"
                type="circle"
                filter={["has", "point_count"]}
                paint={{
                  "circle-color": compactSubjectMap
                    ? BRAND.colors.functionalAmber
                    : CURATED_CLUSTER_COLOR,
                  "circle-radius": compactSubjectMap
                    ? [
                        "interpolate", ["linear"], ["zoom"],
                        7, ["interpolate", ["linear"], ["get", "point_count"], 2, 12, 12, 18],
                        11.25, ["interpolate", ["linear"], ["get", "point_count"], 2, 12, 12, 18],
                        12, ["interpolate", ["linear"], ["get", "point_count"], 2, 8.6, 12, 13],
                      ]
                    : [
                        "interpolate", ["linear"], ["zoom"],
                        7, ["interpolate", ["linear"], ["get", "point_count"], 2, 7, 4, 9, 25, 15, 100, 20],
                        14.25, ["interpolate", ["linear"], ["get", "point_count"], 2, 7, 4, 9, 25, 15, 100, 20],
                        15, ["interpolate", ["linear"], ["get", "point_count"], 2, 4.8, 4, 6.1, 25, 10.2, 100, 13.6],
                      ],
                  "circle-opacity":
                    amenityLayerActive && dock ? 0.12 : 0.92,
                  "circle-stroke-color": compactSubjectMap
                    ? "#FAF3E2"
                    : "#F7F2E8",
                  "circle-stroke-width": compactSubjectMap ? 2 : 1.6,
                  "circle-radius-transition": { duration: mapPaintDuration },
                  "circle-opacity-transition": { duration: mapPaintDuration },
                }}
              />
            )}
            {curatedClusters && (
              <Layer
                id="curated-cluster-counts"
                type="symbol"
                filter={["all", ["has", "point_count"], [">=", ["get", "point_count"], 4]]}
                layout={{
                  "text-field": compactSubjectMap
                    ? ["get", "point_count_abbreviated"]
                    : [
                        "step",
                        ["zoom"],
                        ["get", "point_count_abbreviated"],
                        10.5,
                        [
                          "case",
                          ["<=", ["get", "point_count"], 40],
                          [
                            "concat",
                            ["get", "point_count_abbreviated"],
                            "\n",
                            CURATED_CLUSTER_LABEL,
                          ],
                          ["get", "point_count_abbreviated"],
                        ],
                      ],
                  "text-size": compactSubjectMap
                    ? 11
                    : [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        7,
                        11,
                        10.49,
                        11,
                        10.5,
                        8.5,
                        14.5,
                        8.5,
                      ],
                  "text-line-height": compactSubjectMap ? 1.2 : 0.92,
                  "text-font": [
                    "DIN Pro Medium",
                    "Arial Unicode MS Regular",
                  ],
                  "text-allow-overlap": true,
                  "text-ignore-placement": true,
                }}
                paint={{
                  "text-color": compactSubjectMap ? "#2B2117" : "#FFFDF7",
                  "text-halo-color": compactSubjectMap
                    ? "rgba(250,243,226,0.28)"
                    : "rgba(24,48,49,0.2)",
                  "text-halo-width": compactSubjectMap ? 0.7 : 0.6,
                  "text-opacity": compactSubjectMap
                    ? [
                        "interpolate", ["linear"], ["zoom"],
                        7, amenityLayerActive && dock ? 0.12 : 1,
                        11.25, amenityLayerActive && dock ? 0.12 : 1,
                        12, amenityLayerActive && dock ? 0.02 : 0.18,
                      ]
                    : [
                        "interpolate", ["linear"], ["zoom"],
                        7, amenityLayerActive && dock ? 0.12 : 1,
                        14.25, amenityLayerActive && dock ? 0.12 : 1,
                        15, amenityLayerActive && dock ? 0.02 : 0.18,
                      ],
                  "text-opacity-transition": { duration: mapPaintDuration },
                }}
              />
            )}
            {/* A named search should land on an unmistakable point. This ring
                is reserved for the small search result set, not broad place
                filters, so it adds orientation without covering the street. */}
            <Layer
              id="curated-search-halo"
              type="circle"
              minzoom={12.5}
              filter={[
                "all",
                ["!", ["has", "point_count"]],
                ["==", ["get", "searchMatch"], true],
              ]}
              paint={{
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  12.5,
                  8,
                  15.5,
                  13,
                  18,
                  17,
                ],
                "circle-color": BRAND.colors.brick,
                "circle-opacity": 0.12,
                "circle-stroke-color": BRAND.colors.brick,
                "circle-stroke-width": 2,
                "circle-stroke-opacity": 0.92,
              }}
            />
            {/* Last call — a soft amber halo under places open now but
                closing within the hour. Calm by design (a warm glow, no
                countdown, no pulse): a glance catches what's about to
                close without the map ever shouting. */}
            <Layer
              id="curated-lastcall"
              type="circle"
              minzoom={15.8}
              filter={["all", ["!", ["has", "point_count"]], ["==", ["get", "closing"], true]]}
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 9, 15, 15, 18, 20],
                "circle-color": BRAND.colors.functionalAmber,
                "circle-opacity":
                  amenityLayerActive && dock ? 0.03 : 0.26,
                "circle-blur": 0.55,
              }}
            />
            {/* Dot → puck density transition. Once a cluster resolves, each
                place becomes a small category-colored dot before full pucks
                appear at street zoom. Unclustered embeds keep this same visual
                ladder without the counted overview tier. */}
            <Layer
              id="curated-dots"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-color": compactSubjectMap
                  ? ["get", "color"]
                  : "#536A68",
                "circle-radius": compactSubjectMap
                  ? ["interpolate", ["linear"], ["zoom"], 7.5, 4, 12, 5.5, 16, 7]
                  : [
                      "interpolate", ["linear"], ["zoom"],
                      8.5, ["*", 1.4, ["case", ["==", ["get", "emph"], true], 1.6, ["==", ["get", "dimmed"], true], 0.7, 1]],
                      11, ["*", 1.9, ["case", ["==", ["get", "emph"], true], 1.6, ["==", ["get", "dimmed"], true], 0.7, 1]],
                      13.5, ["*", 2.8, ["case", ["==", ["get", "emph"], true], 1.6, ["==", ["get", "dimmed"], true], 0.7, 1]],
                      15.2, ["*", 3.5, ["case", ["==", ["get", "emph"], true], 1.6, ["==", ["get", "dimmed"], true], 0.7, 1]],
                      17, ["*", 4.1, ["case", ["==", ["get", "emph"], true], 1.6, ["==", ["get", "dimmed"], true], 0.7, 1]],
                    ],
                "circle-stroke-color": "#FAF3E2",
                "circle-stroke-width": compactSubjectMap ? 1.6 : 1,
                "circle-opacity": selectedSlug && dock
                  ? 0.2
                  : amenityLayerActive && dock
                  ? 0.1
                  : compactSubjectMap
                  ? 0.96
                  : [
                      "case",
                      ["==", ["get", "dimmed"], true], 0.18,
                      ["==", ["get", "emph"], true], 0.96,
                      0.78,
                    ],
                "circle-stroke-opacity": compactSubjectMap ? 0.95 : 0.72,
                "circle-radius-transition": { duration: mapPaintDuration },
                "circle-opacity-transition": { duration: mapPaintDuration },
              }}
            />
            {/* A deliberate search/category/amenity task can reveal its
                strongest matches before street zoom. Collision stays on, so
                even this emphasis layer cannot recreate the old icon pile. */}
            {mapLoaded && <Layer
              id="curated-active-icons"
              type="symbol"
              minzoom={compactSubjectMap ? 9.5 : 11}
              filter={["all", ["!", ["has", "point_count"]], ["==", ["get", "emph"], true]]}
              layout={{
                "icon-image": [
                  "coalesce",
                  ["image", ["concat", "cat-", ["get", "category"]]],
                  ["image", "cat-_default"],
                ],
                "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.42, 14, 0.62, 17, 0.82],
                "icon-allow-overlap": false,
                "icon-ignore-placement": false,
                "icon-padding": 3,
                "symbol-sort-key": ["get", "pri"],
              }}
              paint={{
                "icon-opacity": selectedSlug && dock
                  ? 0.2
                  : amenityLayerActive && dock
                    ? 0.12
                    : 1,
                "icon-opacity-transition": { duration: mapPaintDuration },
              }}
            />}
            {mapLoaded && <Layer
              id="curated-icons"
              type="symbol"
              filter={["all", ["!", ["has", "point_count"]], ["!=", ["get", "emph"], true]]}
              minzoom={15.8}
              layout={{
                "icon-image": [
                  "coalesce",
                  ["image", ["concat", "cat-", ["get", "category"]]],
                  ["image", "cat-_default"],
                ],
                // Pin scale by zoom. Tuned smaller across the entire
                // range after audit feedback that pins were eating the
                // map at every zoom level. The county view floor drops
                // to 0.26 (was 0.36 → 0.5 was too big at z9–10), and
                // even at street zoom we cap at ~0.95 instead of 1.1
                // so the user sees more before clutter kicks in.
                // A filter-contrast multiplier rides ON TOP of the zoom
                // curve (the stops themselves are unchanged): a match
                // grows to 1.22×, a non-match shrinks to 0.72×, and a
                // pin on the clean/unfiltered map stays at 1×. Paired
                // with the icon-opacity fade below, matches dominate.
                "icon-size": [
                  "interpolate", ["linear"], ["zoom"],
                  14, ["*", 0.58, ["case", ["==", ["get", "dimmed"], true], 0.72, 1]],
                  16, ["*", 0.75, ["case", ["==", ["get", "dimmed"], true], 0.72, 1]],
                  18, ["*", 0.9, ["case", ["==", ["get", "dimmed"], true], 0.72, 1]],
                  19, ["*", 0.96, ["case", ["==", ["get", "dimmed"], true], 0.72, 1]],
                ],
                // Every place remains visible as a dot. Full category pucks
                // are the close-reading tier and respect collision so streets
                // and names remain legible in dense Downtown blocks.
                "icon-allow-overlap": false,
                "icon-ignore-placement": false,
                "icon-padding": 3,
                "symbol-sort-key": ["get", "pri"],
                "icon-anchor": "center",
              }}
              paint={{
                // Two ways a pin fades, ORed together:
                //  - feature-state `dim`: closed at the scrubbed hour (set
                //    client-side by the scrub effect), and
                //  - the `dimmed` property: doesn't match the active What /
                //    Open-now filter, so it fades instead of vanishing.
                // No state + no filter = full opacity, so this stays inert
                // on the clean map. Dropped 0.28 → 0.15 so the shrunk
                // non-matches recede hard and the grown matches carry the eye.
                //
                "icon-opacity": selectedSlug && dock ? 0.16 : amenityLayerActive && dock ? 0.1 : [
                  "interpolate", ["linear"], ["zoom"],
                  15.8, 0,
                  16.2, [
                    "case",
                    [
                      "any",
                      ["boolean", ["feature-state", "dim"], false],
                      ["==", ["get", "dimmed"], true],
                    ],
                    0.15,
                    1,
                  ],
                ],
                "icon-opacity-transition": { duration: mapPaintDuration },
              }}
            />}
            {/* Invisible tap-target pad — expands each curated pin's
                hit area to a Fitts-friendly ~44px regardless of how
                tiny the rendered icon gets at street zoom. The single-
                place pins shrink under the iOS 44pt floor; this layer
                keeps the touchable region usable (radius 22 = 44px, the
                iOS minimum) without making the visual pins themselves
                bigger. Same source as curated-icons so the click handler
                can resolve back to the same slug via props.slug. */}
            <Layer
              id="curated-hit"
              type="circle"
              minzoom={compactSubjectMap ? 7 : 12.5}
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-color": "#000000",
                "circle-opacity": 0,
                "circle-radius": 22,
              }}
            />
            {/* Names reveal progressively — the ONE curated label layer (the
                old duplicate curated-names was removed; the two double-drew
                names between 15.5 and 16.5). From z13 up, only standout pins
                label: text-optional + collision (allow/ignore-placement false)
                let the engine draw the highest-priority names first and drop
                the rest, so mid zoom shows a few verified names and more appear
                as you zoom. symbol-sort-key uses pri (verified = 0 = drawn
                first = wins the spot), matching curated-icons. */}
            <Layer
              id="curated-labels"
              type="symbol"
              minzoom={compactSubjectMap ? 10.5 : 13}
              filter={["!", ["has", "point_count"]]}
              layout={{
                "text-field": ["get", "name"],
                "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9.5, 16, 12],
                "text-font": ["DIN Pro Regular", "Arial Unicode MS Regular"],
                "text-anchor": "top",
                "text-offset": [0, 1.15],
                "text-optional": true,
                "text-allow-overlap": false,
                "text-ignore-placement": false,
                "text-max-width": 9,
                "symbol-sort-key": ["get", "pri"],
              }}
              paint={{
                "text-color": "#3A362B",
                "text-halo-color": "#FAFAF7",
                "text-halo-width": 1.1,
                "text-opacity": selectedSlug && dock
                  ? 0.14
                  : amenityLayerActive && dock
                    ? 0.14
                    : [
                        "case",
                        ["==", ["get", "emph"], true],
                        1,
                        ["==", ["get", "dimmed"], true],
                        0.12,
                        [
                          "interpolate", ["linear"], ["zoom"],
                          15.8, 0,
                          16.3, 0.82,
                          17, 1,
                        ],
                      ],
              }}
            />
          </Source>

          {selectedPlace && (
            <Marker
              key={`place-lock:${selectedPlace.slug}`}
              longitude={selectedPlace.geom.lng}
              latitude={selectedPlace.geom.lat}
              anchor="center"
              style={{ pointerEvents: "none" }}
            >
              <span className="map-selection-lock" data-map-selection-lock aria-hidden />
            </Marker>
          )}

          {/* Selected place glow — declared last (no sibling shift) but
              ordered beneath the icons via beforeId. */}
          <Source id="curated-selected" type="geojson" data={selectedGeoJson}>
            <Layer
              id="selected-glow"
              type="circle"
              beforeId="curated-icons"
              paint={{
                "circle-color": ["get", "color"],
                "circle-opacity": 0.16,
                "circle-radius": [
                  "interpolate", ["linear"], ["zoom"],
                  11, 16, 16, 30, 18, 42,
                ],
                "circle-stroke-color": ["get", "color"],
                "circle-stroke-opacity": 0.6,
                "circle-stroke-width": 2,
                "circle-blur": 0.3,
                "circle-opacity-transition": { duration: mapPaintDuration },
                "circle-radius-transition": { duration: mapPaintDuration },
              }}
            />
            <Layer
              id="selected-core"
              type="circle"
              paint={{
                "circle-color": ["get", "color"],
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 6, 14, 8, 18, 10],
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 3,
                "circle-opacity": 1,
                "circle-opacity-transition": { duration: mapPaintDuration },
                "circle-radius-transition": { duration: mapPaintDuration },
              }}
            />
          </Source>

          {/* GPS precision sits under the larger user-selected reach ring. */}
          <Source id="location-accuracy" type="geojson" data={accuracyGeoJson}>
            <Layer
              id="location-accuracy-fill"
              type="fill"
              beforeId="curated-lastcall"
              paint={{ "fill-color": "#285D73", "fill-opacity": 0.1 }}
            />
            <Layer
              id="location-accuracy-line"
              type="line"
              beforeId="curated-lastcall"
              paint={{
                "line-color": "#285D73",
                "line-width": 1.25,
                "line-opacity": 0.38,
              }}
            />
          </Source>

          {/* Near-me radius ring (under markers) + a "you are here" dot */}
          <Source id="near-ring" type="geojson" data={ringGeoJson}>
            <Layer
              id="ring-fill"
              type="fill"
              beforeId="curated-lastcall"
              paint={{ "fill-color": "#B5462B", "fill-opacity": 0.07 }}
            />
            <Layer
              id="ring-line"
              type="line"
              beforeId="curated-lastcall"
              paint={{
                "line-color": "#B5462B",
                "line-width": 2,
                "line-opacity": 0.55,
                "line-dasharray": [2, 2],
              }}
            />
          </Source>
          <Source id="near-dot" type="geojson" data={dotGeoJson}>
            <Layer
              id="dot-halo"
              type="circle"
              paint={{ "circle-radius": 13, "circle-color": "#285D73", "circle-opacity": 0.22 }}
            />
            <Layer
              id="dot-core"
              type="circle"
              paint={{
                "circle-radius": 5,
                "circle-color": "#285D73",
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 2,
              }}
            />
          </Source>
          {userLoc && locationFixTimestamp && (
            <Marker
              key={`location-lock:${locationFixTimestamp}`}
              longitude={userLoc.lng}
              latitude={userLoc.lat}
              anchor="center"
              style={{ pointerEvents: "none" }}
            >
              <span className="map-location-lock" data-map-location-lock aria-hidden />
            </Marker>
          )}
          <Source id="near-route" type="geojson" data={routeGeoJson}>
            <Layer
              id="route-line"
              type="line"
              beforeId="curated-lastcall"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "#285D73",
                "line-width": 3.5,
                "line-opacity": 0.75,
                "line-dasharray": routedWalkActive ? [1, 0] : [0.5, 1.6],
              }}
            />
          </Source>

          {/* Live civic overlay — traffic incidents + 311 reports */}
          <Source id="civic" type="geojson" data={civicGeoJson}>
            <Layer
              id="civic-halo"
              type="circle"
              paint={{
                "circle-radius": 9,
                "circle-color": ["match", ["get", "kind"], "traffic", ACCENTS.amber, ACCENTS.slate],
                "circle-opacity": 0.22,
              }}
            />
            <Layer
              id="civic-core"
              type="circle"
              paint={{
                "circle-radius": 5,
                "circle-color": ["match", ["get", "kind"], "traffic", ACCENTS.amber, ACCENTS.slate],
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1.8,
              }}
            />
          </Source>

          {/* Aerial photo overlay — every georeferenced drone shot
              in /public/images/seasons/ as a season-tinted pin. Tap
              one and the Popup below shows the actual photo + the
              date it was taken. No other map can show this; it's
              powered by the EXIF GPS in the user's own photo
              archive. Halo + core matches the civic-pin pattern so
              the styling reads as part of the same family. */}
          <Source
            id="aerial"
            type="geojson"
            data={(visibleAerial ? aerialGeoJson : { type: "FeatureCollection", features: [] }) as unknown as GeoJSON.FeatureCollection}
          >
            <Layer
              id="aerial-halo"
              type="circle"
              paint={{
                "circle-radius": 10,
                // Tint by season — spring sage, summer warm-gold,
                // fall brick, winter cool-slate. Reads as a year of
                // Frederick instead of a uniform pin set.
                "circle-color": [
                  "match",
                  ["get", "season"],
                  "spring", SEASON_HEX.spring,
                  "summer", SEASON_HEX.summer,
                  "fall", SEASON_HEX.fall,
                  "winter", SEASON_HEX.winter,
                  SEASON_HEX.fall,
                ],
                "circle-opacity":
                  aerialSeason === "all"
                    ? 0.22
                    : ["case", ["==", ["get", "season"], aerialSeason], 0.22, 0],
                "circle-opacity-transition": { duration: aerialFade, delay: 0 },
              }}
            />
            <Layer
              id="aerial-icons"
              type="circle"
              paint={{
                "circle-radius": 5,
                "circle-color": [
                  "match",
                  ["get", "season"],
                  "spring", SEASON_HEX.spring,
                  "summer", SEASON_HEX.summer,
                  "fall", SEASON_HEX.fall,
                  "winter", SEASON_HEX.winter,
                  SEASON_HEX.fall,
                ],
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1.6,
                "circle-opacity":
                  aerialSeason === "all"
                    ? 1
                    : ["case", ["==", ["get", "season"], aerialSeason], 1, 0],
                "circle-opacity-transition": { duration: aerialFade, delay: 0 },
                "circle-stroke-opacity":
                  aerialSeason === "all"
                    ? 1
                    : ["case", ["==", ["get", "season"], aerialSeason], 1, 0],
                "circle-stroke-opacity-transition": { duration: aerialFade, delay: 0 },
              }}
            />
          </Source>

          {/* Aerial photo popup — fires when the user taps a pin in
              the Aerial photos overlay. Shows the photo thumbnail at
              a generous size + the season tag + the capture date.
              Designed to feel like opening a postcard from the spot
              the pin marks. */}
          {selectedAerial && (!dock || !compactMapViewport) && (
            <Popup
              longitude={selectedAerial.lng}
              latitude={selectedAerial.lat}
              anchor="bottom"
              offset={20}
              closeOnClick={true}
              onClose={clearMapSelection}
              maxWidth="320px"
            >
              <div className="space-y-2">
                <div
                  className="relative w-full overflow-hidden rounded-[var(--app-radius-md)]"
                  style={{ aspectRatio: "16/9" }}
                >
                  {/* Plain <img> — Mapbox popup content sits outside
                      Next's <Image> component, but we can still hit the
                      optimizer endpoint directly: the source is a full
                      1920×1080 jpeg and the card is ~320px wide, so a
                      640px variant (2× DPR) is a fraction of the bytes. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sizedImage(selectedAerial.src, 640)}
                    alt={`Aerial photo, ${selectedAerial.season}`}
                    width={320}
                    height={180}
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
                <div className="flex items-baseline justify-between gap-2 px-0.5">
                  <p
                    className="text-[11px] font-bold uppercase tracking-[0.12em]"
                    style={{
                      color: ({
                        spring: SEASON_HEX.spring,
                        summer: SEASON_HEX.summer,
                        fall: SEASON_HEX.fall,
                        winter: SEASON_HEX.winter,
                      }[selectedAerial.season]) ?? SEASON_HEX.fall,
                    }}
                  >
                    {selectedAerial.season}
                  </p>
                  {selectedAerial.takenAt && (
                    <p
                      className="text-[11px] tabular-nums"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }).format(new Date(selectedAerial.takenAt))}
                    </p>
                  )}
                </div>
              </div>
            </Popup>
          )}

          {/* Historic cemeteries — the opt-in heritage overlay (county
              GIS). Small muted stone-gray dots, quieter than any live
              layer: history is context, not a call to action. Tapping
              one opens the popup below with the name + locale. */}
          <Source
            id="cemeteries"
            type="geojson"
            data={(visibleCemeteries ? cemeteryGeoJson : { type: "FeatureCollection", features: [] }) as unknown as GeoJSON.FeatureCollection}
          >
            <Layer
              id="cemetery-icons"
              type="circle"
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 13, 4, 16, 5.5],
                // Muted stone gray — an ink tint, not a brand color, so
                // 250+ history dots read as texture under the live pins.
                "circle-color": "#6E6657",
                "circle-opacity": 0.85,
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1.2,
              }}
            />
          </Source>

          {/* Cemetery popup — name, the locale the county files it
              under, and an honest note when the county itself marks the
              point approximate. No established date: the county layer
              doesn't carry one, and we never invent data. */}
          {selectedCemetery && (!dock || !compactMapViewport) && (
            <Popup
              longitude={selectedCemetery.lng}
              latitude={selectedCemetery.lat}
              anchor="bottom"
              offset={12}
              closeOnClick={true}
              onClose={clearMapSelection}
              maxWidth="240px"
            >
              <div style={{ padding: "2px 2px 4px", minWidth: 170 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--app-ink-3, #5C5A50)", margin: 0 }}>
                  Historic cemetery
                </p>
                <strong className="font-sans" style={{ display: "block", fontSize: 16, lineHeight: 1.2, color: "var(--app-ink, #221C15)", marginTop: 1 }}>
                  {selectedCemetery.name}
                </strong>
                {selectedCemetery.place && (
                  <p style={{ marginTop: 4, fontSize: 12, color: "var(--app-ink-2, #5A5348)" }}>
                    {selectedCemetery.place}
                  </p>
                )}
                {selectedCemetery.approximate && (
                  <p style={{ marginTop: 4, fontSize: 11, color: "var(--app-ink-3, #5C5A50)" }}>
                    This location is approximate and based on county records.
                  </p>
                )}
                <p style={{ marginTop: 7, fontSize: 10, lineHeight: 1.35, color: "var(--app-ink-3, #5C5A50)" }}>
                  <a
                    href="https://services5.arcgis.com/o8KSxSzYaulbGcFX/arcgis/rest/services/HistoricCemeteries/FeatureServer/0"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "inherit", textDecoration: "underline" }}
                  >
                    Frederick County GIS
                  </a>
                  {" · "}compiled from Jacob M. Holdcraft records
                </p>
              </div>
            </Popup>
          )}

          {/* A selected map highlight is drawn as a constellation: the
              selected facts stay strong, unrelated place pins recede, and the
              dashed connectors make the join visible without pretending to
              be a walking or driving route. */}
          <MapDiscoveryOverlay discovery={selectedDiscovery} />

          {/* One marker per venue cell. A count opens every co-located event
              in chronological order instead of fanning buttons away from the
              real location. */}
          {eventGroups.map((group) => {
            const lead = group.events[0];
            const inView = group.events.some((event) =>
              eventSlugsInCamera.has(event.slug),
            );
            const discoveryMatch = group.events.some((event) =>
              selectedDiscovery?.points.some((point) => point.id === `event:${event.slug}`),
            );
            return (
              <Marker
                key={`evg:${group.id}`}
                ref={exposeMarkerChild}
                longitude={group.lng}
                latitude={group.lat}
                anchor="bottom"
              >
                <button
                  type="button"
                  tabIndex={inView ? 0 : -1}
                  onClick={(pointerEvent) => {
                    pointerEvent.stopPropagation();
                    haptic("light");
                    if (group.events.length === 1) {
                      openMapSelection({ kind: "event", value: lead });
                    } else {
                      openMapSelection({ kind: "event-group", value: group });
                    }
                    const map = mapRef.current?.getMap();
                    if (map && map.getZoom() < 14) {
                      cameraIntentRef.current = true;
                      smoothFocus(map, [group.lng, group.lat], { minZoom: 14, maxStep: 4 });
                    }
                  }}
                  aria-label={
                    group.events.length === 1
                      ? `${lead.title} at ${lead.venue_name}`
                      : `${group.events.length} events at ${group.venueLabel}`
                  }
                  className="fr-event-marker"
                  data-group={group.events.length > 1 || undefined}
                  style={{
                    opacity: selectedDiscovery && !discoveryMatch ? 0.18 : 1,
                    "--event-color": lead.category_color || "var(--app-brand)",
                  } as React.CSSProperties}
                >
                  <span aria-hidden className="fr-ev-pulse" />
                  <span
                    aria-hidden
                    className="fr-event-marker-face"
                    style={{
                      background: lead.category_color || "var(--app-brand)",
                    }}
                  >
                    {group.events.length > 1 ? (
                      group.events.length
                    ) : (
                      <CategoryIcon
                        slug={lead.category}
                        className="h-4 w-4"
                        strokeWidth={2.25}
                      />
                    )}
                  </span>
                </button>
              </Marker>
            );
          })}

          {/* Live food trucks are high-signal and scarce, so a valid operator
              beacon appears without another layer toggle. Every pin carries
              its own expiry and disappears on the client when that time
              passes; venue hours never create one. */}
          {liveFoodTruckPins.map((pin) => (
            <Marker
              key={`food-truck:${pin.slug}`}
              ref={exposeMarkerChild}
              longitude={pin.lng}
              latitude={pin.lat}
              anchor="bottom"
            >
              <button
                type="button"
                className="fr-food-truck-marker"
                tabIndex={isPointInView(pin.lng, pin.lat) ? 0 : -1}
                aria-label={`${pin.name}, operator-confirmed live location`}
                onClick={(event) => {
                  event.stopPropagation();
                  haptic("light");
                  openMapSelection({ kind: "food-truck", value: pin });
                }}
              >
                <span aria-hidden className="fr-food-truck-pulse" />
                <span aria-hidden className="fr-food-truck-glyph">
                  <Truck className="h-[17px] w-[17px]" strokeWidth={2.1} />
                </span>
              </button>
            </Marker>
          ))}

          {/* Parking layer — the five downtown city garages as "P" glyph
              markers, tinted by LIVE availability (green plenty / amber
              filling / red full / ink unknown). DOM markers (not a GeoJSON
              layer) so each is a real ≥44px, keyboard-reachable button and
              the glyph stays crisp. Tapping raises the parking peek. */}
          {visibleParking &&
            parking.map((g) => {
              const tone = parkingTone(g);
              const { fill, ink } = PARKING_TONE_STYLE[tone];
              return (
                <Marker
                  key={`park:${g.slug}`}
                  ref={exposeMarkerChild}
                  longitude={g.lng}
                  latitude={g.lat}
                  anchor="bottom"
                >
                  <button
                    type="button"
                    tabIndex={isPointInView(g.lng, g.lat) ? 0 : -1}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      haptic("light");
                      openMapSelection({ kind: "parking", value: g });
                    }}
                    aria-label={`${g.name} parking garage${g.isClosed ? ", closed" : ""}`}
                    className="fr-park-marker"
                    style={{ "--park-fill": fill, "--park-ink": ink } as React.CSSProperties}
                  >
                    <span aria-hidden className="fr-park-glyph">P</span>
                  </button>
                </Marker>
              );
            })}

          {selectedEvent && (!dock || !compactMapViewport) && (
            <Popup
              longitude={selectedEvent.lng}
              latitude={selectedEvent.lat}
              anchor="bottom"
              offset={28}
              closeOnClick={true}
              onClose={clearMapSelection}
              maxWidth="280px"
            >
              <EventPopup e={selectedEvent} />
            </Popup>
          )}

          {hover && !selectionOpen && (
            <Popup
              longitude={hover.lng}
              latitude={hover.lat}
              anchor="bottom"
              offset={16}
              closeButton={false}
              closeOnClick={false}
              className="fr-hover-popup"
            >
              <div style={{ pointerEvents: "none", padding: "2px 2px", maxWidth: 220 }}>
                <strong style={{ display: "block", fontSize: 13, color: "#1A1A1A", lineHeight: 1.25 }}>
                  {hover.label}
                </strong>
                {hover.sub && (
                  <span style={{ fontSize: 11, color: "#7A7975" }}>{hover.sub}</span>
                )}
              </div>
            </Popup>
          )}

          {selected && (!dock || !compactMapViewport) && (
            <Popup
              longitude={selected._kind === "place" ? selected.geom.lng : selected.lng}
              latitude={selected._kind === "place" ? selected.geom.lat : selected.lat}
              anchor="bottom"
              offset={14}
              closeOnClick={true}
              onClose={clearMapSelection}
              maxWidth="300px"
            >
              {selected._kind === "place" ? (
                <PlacePopup p={selected} />
              ) : (
                <OsmPopup p={selected} />
              )}
            </Popup>
          )}

          {/* Desktop keeps stock zoom as camera furniture. Mobile follows the
              native-map pattern: pinch/double-tap on the canvas, one visible
              Locate action, and no permanent zoom stack competing with the
              bottom command bar. GeolocateControl stays on dock-less embeds. */}
          {(!dock || !compactMapViewport) && !dockPaneOpen && !selectionOpen && (
            <NavigationControl position="bottom-right" showCompass={false} />
          )}
          {!dock && !compactSubjectMap && (
            <GeolocateControl position="bottom-right" trackUserLocation />
          )}
        </Map>

        <p
          key={resultAreaAnnouncement.nonce}
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-map-result-announcement
        >
          {resultAreaAnnouncement.message}
        </p>

        {dock &&
          !mapError &&
          !dockPaneOpen &&
          !selectionOpen &&
          showResultsHere && (
            <button
              type="button"
              className="map-results-here map-top-action tap-44"
              onClick={commitCurrentResultArea}
              data-map-top-surface="results"
            >
              <span className="map-results-here-dot" aria-hidden />
              Show results here
            </button>
          )}

        {dock && !mapError && !dockPaneOpen && !selectionOpen && (
          <MapEdgeTools
            awake={edgeToolsAwake}
            onWake={wakeMapEdgeTools}
            locating={locating}
            located={Boolean(userLoc)}
            onLocate={goNearMe}
            overlays={edgeOverlayState}
            onToggle={toggleEdgeOverlay}
            incidentHealth={incidentHealth}
            recentIncidentCount={recentIncidentCount}
            latestIncident={
              incidentHealth.status !== "ready"
                ? null
                : latestIncidentSummary
            }
            onFocusIncident={focusIncidentFromEdge}
            rotorcraftStatus={rotorcraftStatus}
          />
        )}

        {/* ── The dock: one instrument for the browse map. Scrim + card;
            collapsed face is the What · When · Where caption. ── */}
        {dock && !mapError && (
          <div
            className="map-dock-slot"
            inert={compactMapViewport && selectionOpen}
            aria-hidden={compactMapViewport && selectionOpen}
          >
          <MapDock
            browse={dock}
            placeCount={inViewPlaces.length}
            eventCount={inViewEvents.length}
            closingSoonCount={closingSoonCount}
            q={q}
            setQ={setMapQuery}
            searchMatches={searchMatches}
            searchPending={
              q.trim().length >= 2 &&
              searchSettledQuery !== q.trim()
            }
            searchUnavailable={searchUnavailableQuery === q.trim()}
            retrySearch={() => setSearchAttempt((attempt) => attempt + 1)}
            searchOpeningId={searchOpeningId}
            pickSearch={pickSearch}
            searchDistanceOriginLabel={userLoc ? "from you" : "from map center"}
            openNowAvailable={dock.openNowAvailable}
            openNowUnavailableLabel={dock.openNowUnavailableLabel}
            savedCount={followedSlugs.size}
            showSavedOnly={showSavedOnly}
            setShowSavedOnly={setShowSavedOnly}
            fieldNotesCount={fieldNotesCount}
            fieldNotesOnly={fieldNotesOnly}
            setFieldNotesOnly={setFieldNotesOnly}
            amenityCount={amenityCount}
            amenityGroupCounts={amenityGroupCounts}
            communityReportCount={communityReportCount}
            amenityGroups={amenityGroups}
            setAmenityGroups={setAmenityGroups}
            focusNearestAmenity={focusNearestAmenity}
            civicAvailable={civic.length > 0}
            showCivic={showCivic}
            setShowCivic={setShowCivic}
            transitHealth={transitHealth}
            showTransit={showTransit}
            setShowTransit={setShowTransit}
            trailCount={trailLines.features.length}
            showTrails={showTrails}
            setShowTrails={setShowTrails}
            aerialCount={AERIAL_PHOTOS.length}
            showAerial={showAerial}
            setShowAerial={setShowAerial}
            aerialSeasons={aerialSeasonItems}
            aerialSeason={aerialSeason}
            onAerialSeason={(k) => { setAerialSeason(k as AerialSeason); haptic("light"); }}
            cemeteryCount={cemeteries.length}
            showCemeteries={showCemeteries}
            setShowCemeteries={setShowCemeteries}
            parkingCount={parking.length}
            showParking={showParking}
            setShowParking={setShowParking}
            showRadar={showRadar}
            setShowRadar={setShowRadar}
            radarHealth={radarHealth}
            showTraffic={showTraffic}
            setShowTraffic={setShowTraffic}
            floodContextCount={floodContext.features.length}
            snowRouteCount={snowRoutes.features.length}
            roadsNowActive={showTraffic || showCivic || showIncidents}
            roadsNowFullyOn={showTraffic && showCivic && showIncidents}
            setShowRoadsNow={(show) => {
              setShowTraffic(show);
              setShowCivic(show);
              setShowIncidents(show);
            }}
            showIncidents={showIncidents}
            setShowIncidents={setShowIncidents}
            incidentHealth={incidentHealth}
            showRotorcraft={showRotorcraft}
            setShowRotorcraft={setShowRotorcraft}
            showCameras={showCameras}
            setShowCameras={setShowCameras}
            cameraHealth={cameraHealth}
            radarFrameEpoch={radarFrameEpoch}
            activeOverlays={activeOverlays}
            toggleOverlay={toggleOverlay}
            scrubHour={scrubHour}
            setScrubHour={setScrubHour}
            userLoc={userLoc}
            locating={locating}
            geoMsg={geoMsg}
            goNearMe={goNearMe}
            flyTo={(center, zoom) => {
              cameraIntentRef.current = true;
              mapRef.current?.getMap().flyTo({
                center,
                zoom,
                duration: prefersReducedMotion() ? 0 : 1100,
                curve: 1.25,
                easing: CAM_EASE,
                essential: true,
              });
            }}
            fitCounty={fitCounty}
            shareCameraParam={() => {
              const map = mapRef.current?.getMap();
              const viewport = map ? readResultViewport(map) : null;
              return viewport ? mapCameraParam(viewport) : null;
            }}
            discoveries={discoveries}
            selectedDiscoveryId={selectedDiscovery?.id ?? null}
            onSelectDiscovery={(id) => {
              const discovery = discoveries.find((item) => item.id === id);
              if (discovery) showDiscovery(discovery);
            }}
            onPaneOpenChange={handleDockPaneOpenChange}
            suppressContextRail={selectionOpen || showResultsHere || !mapLoaded}
          />
          </div>
        )}

        {/* "Show the whole county" reset — one tap back to the overview when a
            user has zoomed or panned in and lost the lay of the land. Getting
            un-lost used to be buried under Filters → Where → Whole county.
            Stacked just above the locate FAB; only shown once off the overview
            so the default county view stays uncluttered. */}
        {dock && !mapError && !dockPaneOpen && !selectionOpen && offOverview && (
          <button
            type="button"
            className="map-reset-fab tap-44"
            onClick={fitCounty}
            aria-label="Show the whole county"
          >
            <Shrink className="h-5 w-5" strokeWidth={2.2} aria-hidden />
          </button>
        )}

        {dock && selectedDiscovery && (
          <MapDiscoveryPeek
            discovery={selectedDiscovery}
            index={Math.max(0, selectedDiscoveryIndex)}
            total={Math.max(1, discoveryDeck.length)}
            onPrevious={() => showDiscoveryAt((selectedDiscoveryIndex < 0 ? 0 : selectedDiscoveryIndex) - 1)}
            onNext={() => showDiscoveryAt((selectedDiscoveryIndex < 0 ? 0 : selectedDiscoveryIndex) + 1)}
            onClose={clearMapSelection}
          />
        )}

        {dock && compactMapViewport && selectedEvent && (
          <MapEventPeek event={selectedEvent} onClose={clearMapSelection} />
        )}

        {dock && compactMapViewport && selected && (
          <MapRawPeek
            item={selected}
            distanceOrigin={userLoc}
            contextLabel={rawSelectionContext}
            onClose={clearMapSelection}
          />
        )}

        {dock && compactMapViewport && civicTown && (() => {
          const municipality =
            MUNICIPALITIES.find((item) => item.slug === civicTown.slug) ?? null;
          const civicRecord = municipality
            ? municipalCivicFor(municipality.slug)
            : null;
          return (
            <MapTownPeek
              title={municipality?.name ?? civicTown.name}
              contacts={civicRecord ? civicContacts(civicRecord).slice(0, 2) : []}
              guideHref={municipality ? `/m/${municipality.slug}` : undefined}
              onClose={clearMapSelection}
            />
          );
        })()}

        {dock && compactMapViewport && selectedAerial && (
          <MapAerialPeek photo={selectedAerial} onClose={clearMapSelection} />
        )}

        {dock && compactMapViewport && selectedCemetery && (
          <MapCemeteryPeek
            cemetery={selectedCemetery}
            onClose={clearMapSelection}
          />
        )}

        {dock && compactMapViewport && marcPeek && (() => {
          const station = marcStations.find((item) => item.name === marcPeek);
          return station ? (
            <MapMarcPeek station={station} onClose={clearMapSelection} />
          ) : null;
        })()}

        {dock && spotSelection && spotContext && !peekPlace && !parkingPeek && !foodTruckPeek && !selectedDiscovery && (
          <MapSpotPeek
            spot={spotSelection}
            context={spotContext}
            utilities={nearestMapUtilities(spotSelection, utilityPoints, 800, 4)}
            label={spotSelection.label}
            temporary={spotSelection.temporary}
            attribution={spotSelection.attribution}
            onClose={clearMapSelection}
            onOpenPlace={(slug) => {
              const place = places.find((candidate) => candidate.slug === slug);
              if (!place) return;
              openMapSelection({ kind: "place", value: place });
              const map = mapRef.current?.getMap();
              cameraIntentRef.current = true;
              if (map) {
                map.easeTo({
                  center: [place.geom.lng, place.geom.lat],
                  zoom: Math.max(map.getZoom(), 14),
                  offset: [0, -120],
                  duration: prefersReducedMotion() ? 0 : 500,
                  essential: true,
                });
              }
            }}
          />
        )}

        {/* The pin peek card. The cross-join: the soonest event pin hosted
            AT this place (venue_place_slug) rides along, so tapping a
            brewery answers "anything on here tonight?" without leaving the
            map (2026-07-17 map audit #2). */}
        {peekPlace && !parkingPeek && !foodTruckPeek && (
          <MapPeek
            place={peekPlace}
            hostedEvent={
              events
                .filter((e) => e.venue_place_slug && e.venue_place_slug === peekPlace.slug)
                .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] ?? null
            }
            nearestGarage={
              // The third question after "open?" and "anything on?":
              // where do I park. Nearest downtown garage within a
              // 5-6 minute walk, with the live space count when the
              // feed reports one (2026-07-17 map audit follow-on).
              parking
                .map((g) => ({
                  g,
                  d: haversineMeters(peekPlace.geom, { lng: g.lng, lat: g.lat }),
                }))
                .filter((x) => x.d <= 500)
                .sort((a, b) => a.d - b.d)
                .map((x) => ({ name: x.g.name, distM: x.d, available: x.g.available }))[0] ?? null
            }
            nearbyUtilities={nearestMapUtilities(peekPlace.geom, utilityPoints)}
            // Once a place is selected the camera centers on that pin, so a
            // "0 ft from map center" readout is technically true but useless.
            // Show card distance only from a real device location; search
            // results retain the explicit map-center distance before selection.
            distanceOrigin={userLoc}
            distanceOriginLabel="from you"
            onClose={clearMapSelection}
            onDetails={() => openPlaceSheet(peekPlace)}
          />
        )}

        {/* The parking garage peek — its own compact card (a garage isn't a
            saveable place): live spaces, hourly rate, and Directions. */}
        {parkingPeek && (
          <MapParkingPeek pin={parkingPeek} userLoc={userLoc} onClose={clearMapSelection} />
        )}

        {foodTruckPeek && !peekPlace && !parkingPeek && (
          <MapFoodTruckPeek pin={foodTruckPeek} onClose={clearMapSelection} />
        )}

        <BottomDrawer
          title={selectedTransitStop?.name ?? "Bus stop"}
          subtitle="Live Frederick County TransIT arrivals"
          open={selectedTransitStop !== null}
          onOpenChange={(open) => {
            if (!open) clearMapSelection();
          }}
        >
          {selectedTransitStop && (
            <div className="pb-4">
              <StopArrivalsPopup
                key={selectedTransitStop.id}
                stop={selectedTransitStop}
                showName={false}
              />
              <Link
                href="/transit"
                className="tap-44 mt-3 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-semibold"
                style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
              >
                Open Transit
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </Link>
            </div>
          )}
        </BottomDrawer>

        {/* MARC station popup — the next scheduled trains, as clock times
            from the committed GTFS schedule (weekday commuter service;
            honest empty line when no more trains today). */}
        {marcPeek && (!dock || !compactMapViewport) && (() => {
          const st = marcStations.find((m) => m.name === marcPeek);
          if (!st) return null;
          return (
            <Popup
              longitude={st.lng}
              latitude={st.lat}
              anchor="bottom"
              onClose={clearMapSelection}
              closeOnClick
              maxWidth="260px"
            >
              <div style={{ fontFamily: "var(--font-inter, inherit)" }}>
                <p className="font-sans text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                  MARC · {st.name}
                </p>
                {st.departures.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {st.departures.map((d, i) => (
                      <li key={i} className="text-[12px]" style={{ color: "var(--app-ink-2)" }}>
                        <span className="font-mono">{d.clock}</span> to {d.headsign}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                    No more departures are scheduled today.
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <a
                    href={directionsHref(st.lat, st.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tap-44 inline-flex items-center rounded-full border px-3 py-2 text-[12px] font-semibold"
                    style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
                  >
                    Directions
                  </a>
                  <Link
                    href="/transit"
                    className="tap-44 inline-flex items-center rounded-full border px-3 py-2 text-[12px] font-semibold"
                    style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
                  >
                    Open Transit
                  </Link>
                </div>
              </div>
            </Popup>
          );
        })()}

        {/* Co-located events remain one honest point on the map. The count
            marker opens this chronological index so no occurrence is hidden
            and each row can become the normal event popup in one tap. */}
        <BottomDrawer
          title={eventGroup?.venueLabel ?? "Events here"}
          subtitle={
            eventGroup
              ? `${eventGroup.events.length} ${eventGroup.events.length === 1 ? "event" : "events"} at this location`
              : undefined
          }
          open={eventGroup !== null}
          onOpenChange={(open) => {
            if (!open) clearMapSelection();
          }}
        >
          <ul className="space-y-1 pb-4">
            {(eventGroup?.events ?? []).map((event) => {
              const startsAt = new Date(event.starts_at);
              const when = Number.isFinite(startsAt.getTime())
                ? new Intl.DateTimeFormat("en-US", {
                    timeZone: "America/New_York",
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(startsAt)
                : "Time unavailable";
              return (
                <li key={event.slug}>
                  <button
                    type="button"
                    className="tap-44 flex w-full items-center gap-3 rounded-[var(--app-radius-sm)] px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--app-bg-sunken)]"
                    onClick={() => {
                      openMapSelection({ kind: "event", value: event });
                      haptic("light");
                      const map = mapRef.current?.getMap();
                      if (map) {
                        cameraIntentRef.current = true;
                        smoothFocus(map, [event.lng, event.lat], {
                          minZoom: 14,
                          maxStep: 4,
                        });
                      }
                    }}
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background: event.category_color || "var(--app-brand)",
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[14px] font-semibold"
                        style={{ color: "var(--app-ink)" }}
                      >
                        {event.title}
                      </span>
                      <span
                        className="mt-0.5 block text-[12px]"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        {when}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0"
                      strokeWidth={2}
                      aria-hidden
                      style={{ color: "var(--app-ink-3)" }}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </BottomDrawer>

      </div>
  );
}
