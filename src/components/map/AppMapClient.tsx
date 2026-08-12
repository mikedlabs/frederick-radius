"use client";

import dynamic from "next/dynamic";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { FoodTruckMapPin, MapPinPlace, MarcStationPin, TransitStopPin } from "./types";
import { haversineMeters } from "@/lib/geo";
import { isOpenNow } from "@/lib/hours";
import type { Amenity, AmenityKind } from "@/lib/loaders/amenities";
import type { ParkingPin } from "@/lib/map/parking";
import MapLoadingScene from "./MapLoadingScene";
import MapList from "./MapList";
import type { SmartMapDefault } from "@/lib/map/smartDefaults";
import type { MapSceneContext } from "./AppMap";

const EMBEDDED_MAP_HEIGHT = "78vh";
const APP_MAP_CHUNK_TIMEOUT_MS = 15_000;

let appMapChunkReady = false;
const appMapChunkReadyListeners = new Set<() => void>();

function markAppMapChunkReady() {
  appMapChunkReady = true;
  for (const listener of appMapChunkReadyListeners) listener();
  appMapChunkReadyListeners.clear();
}

function subscribeToAppMapChunkReady(listener: () => void) {
  if (appMapChunkReady) {
    listener();
    return () => undefined;
  }
  appMapChunkReadyListeners.add(listener);
  return () => appMapChunkReadyListeners.delete(listener);
}

class MapChunkBoundary extends Component<
  {
    children: ReactNode;
    onFailure: () => void;
    fallback: ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailure();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback;
  }
}

const AppMap = dynamic(
  () =>
    import("./AppMap").then((module) => {
      markAppMapChunkReady();
      return module;
    }),
  {
  ssr: false,
  // The visible Frederick-specific scene is rendered by this light wrapper,
  // outside the deferred Mapbox chunk. This placeholder only reserves the
  // embedded map's space while that chunk arrives.
  loading: () => (
    <div
      data-map-dynamic-loading
      aria-hidden="true"
      className="relative h-full w-full overflow-hidden rounded-[var(--app-radius-lg)]"
    />
  ),
  },
);

/**
 * Shared interactive map shell. The full browse map keeps its result area
 * stable while somebody pans, then accepts the new camera through one
 * contextual action. Embedded subject maps continue to settle immediately.
 */
export type {
  CivicPin,
  MapLineFC,
  EventPin,
  CemeteryPin,
  BrowseDockInfo,
  RoadWorkZoneFC,
  FloodContextFC,
  SnowRouteFC,
} from "./types";
import {
  EMPTY_FLOOD_CONTEXT_FC,
  EMPTY_ROAD_WORK_ZONE_FC,
  EMPTY_SNOW_ROUTE_FC,
  type CivicPin,
  type MapLineFC,
  type EventPin,
  type CemeteryPin,
  type BrowseDockInfo,
  type RoadWorkZoneFC,
  type FloodContextFC,
  type SnowRouteFC,
} from "./types";
import type { OsmPlace } from "@/lib/integrations/overpass";
import type { MapLayerGroup } from "./deferredBrowseLayers";

const EMPTY_FC: MapLineFC = { type: "FeatureCollection", features: [] };

export function MapLoadFailure({
  height,
  places,
  events,
  trailLineOnly = false,
}: {
  height: CSSProperties["height"];
  places: MapPinPlace[];
  events: EventPin[];
  trailLineOnly?: boolean;
}) {
  const hasRows = places.length > 0 || events.length > 0;
  const title = trailLineOnly
    ? "The interactive trail map did not load."
    : "The map did not finish loading.";
  const detail = trailLineOnly
    ? "The trail guide on this page still works. Reload to try the interactive lines again."
    : hasRows
      ? "You can still open the places and events here, or reload the map."
      : "The rest of this page still works. Reload to try the map again.";

  return (
    <div
      className="w-full overflow-y-auto"
      style={{ height, background: "var(--app-bg-sunken)" }}
      data-map-chunk-failure
    >
      <div
        role="alert"
        className="mx-auto max-w-[680px] px-6 py-8 text-center"
      >
        <p className="font-serif text-lg font-semibold" style={{ color: "var(--app-ink)" }}>
          {title}
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--app-ink-2)" }}>
          {detail}
        </p>
        <button
          type="button"
          className="tap-44 mt-4 min-h-11 rounded-full border px-4 text-sm font-semibold"
          style={{
            borderColor: "var(--app-border-strong)",
            background: "var(--app-bg-elevated)",
            color: "var(--app-ink)",
          }}
          onClick={() => window.location.reload()}
        >
          Reload map
        </button>
      </div>
      {hasRows && !trailLineOnly && (
        <MapList
          places={places}
          events={events}
          userLoc={null}
          failureMode
          onPick={(place) => window.location.assign(`/places/${place.slug}`)}
          onPickEvent={(event) => window.location.assign(`/events/${event.slug}`)}
        />
      )}
    </div>
  );
}

export default function AppMapClient({
  places,
  civic = [],
  extraAmenities = [],
  amenities = [],
  trailLines = EMPTY_FC,
  trailsLayerDefault = false,
  transitLines = EMPTY_FC,
  municipalBoundaries = EMPTY_FC,
  countyBoundary = EMPTY_FC,
  cemeteries = [],
  parking = [],
  events = [],
  transitStops = [],
  marcStations = [],
  foodTruckPins = [],
  roadWorkZones = EMPTY_ROAD_WORK_ZONE_FC,
  floodContext = EMPTY_FLOOD_CONTEXT_FC,
  snowRoutes = EMPTY_SNOW_ROUTE_FC,
  fullBleed = false,
  smartDefault = null,
  sceneContext,
  recenterToKnownLocation = false,
  pinpointDefault = false,
  initialCenter,
  initialZoom,
  initialBounds,
  initialBoundsPadding,
  cameraMinZoom,
  cameraMaxBounds,
  compactSubjectMap = false,
  initialAmenityGroups,
  dock,
  activeSlugs = null,
  showSearchControls = true,
  onLayerDemand,
  children,
}: {
  /** Already decorated server-side (map/page → publicPlaces().map
   *  (decoratePlace)). The client must NOT re-import the loader: it
   *  drags the ~12MB places-enrichment.json into the browser bundle
   *  and the map never loads. */
  // MapPinPlace: the pin-field subset. Full PlaceCardData satisfies it
  // structurally, so SavedList / radius mode pass their full records as-is;
  // /map browse passes the slim set and the sheet hydrates on tap.
  places: MapPinPlace[];
  civic?: CivicPin[];
  /** Server-fetched amenity points (e.g. Mapillary trash) merged into
   *  the map's amenity layer — keeps the secret token server-side. */
  extraAmenities?: OsmPlace[];
  /** Curated civic amenities (amenities.json) — always-present set
   *  that backs the Amenities tray + Radius. */
  amenities?: Amenity[];
  /** Server-fetched toggleable line overlays (#3). */
  trailLines?: MapLineFC;
  /** Open the Trails layer ON at first paint (the /trails surface). */
  trailsLayerDefault?: boolean;
  transitLines?: MapLineFC;
  /** County GIS municipal boundary polygons — quiet always-on outline. */
  municipalBoundaries?: MapLineFC;
  /** County boundary polygon — the quiet always-on county edge (6.1). */
  countyBoundary?: MapLineFC;
  /** Historic cemeteries (county GIS heritage points) — the opt-in
   *  overlay behind the Layers panel; OFF by default. */
  cemeteries?: CemeteryPin[];
  /** Downtown parking garages (static metadata + live availability) — the
   *  opt-in Parking layer, forwarded to AppMap. Empty on embeds. */
  parking?: ParkingPin[];
  /** Upcoming events as photo pins — passed through to AppMap. The
   *  /map page filters to "happening soon" server-side so this stays a
   *  small (≤30 item) array. */
  events?: EventPin[];
  /** Bus-stop dots + MARC stations for the Transit layer (phase 3).
   *  Forwarded to AppMap; empty on embeds. */
  transitStops?: TransitStopPin[];
  marcStations?: MarcStationPin[];
  /** Operator-confirmed, self-expiring food-truck pins. */
  foodTruckPins?: FoodTruckMapPin[];
  /** Official WZDx work-zone geometry, shown under the existing Traffic view. */
  roadWorkZones?: RoadWorkZoneFC;
  /** Public County high-water context; static, attributed, and not a live alert. */
  floodContext?: FloodContextFC;
  /** Current County SnowCommand route-operation reports. */
  snowRoutes?: SnowRouteFC;
  /** Full-bleed canvas: the map fills the parent, no card border, no
   *  "In view" list below. The map IS the page. The synced list lives
   *  in a slide-up sheet inside the map area instead. */
  fullBleed?: boolean;
  /** Map program phase 1: the moment-aware cold-open default, passed
   *  through to AppMap on the full-bleed browse map only. */
  smartDefault?: SmartMapDefault;
  sceneContext?: MapSceneContext;
  /** Center the camera (and measure list distances) from the user's
   *  last-known location when we already have a cached fix — so the
   *  list reads closest-first "from where you're standing." Never
   *  prompts; falls back to the city center. */
  recenterToKnownLocation?: boolean;
  /** Pinpoint-first: open the browse map clean (no pins) until the user
   *  adds a category. Set when browsing with no server-side intent. */
  pinpointDefault?: boolean;
  /** Seed the camera here (e.g. a /map?at=lat,lng deep-link from a park or
   *  trail row) instead of the county default. Forwarded to AppMap, whose
   *  initialZoom (14) frames it. Undefined -> AppMap's county default. */
  initialCenter?: [number, number];
  /** Scope-aware opening zoom (county overview vs town/street framing). */
  initialZoom?: number;
  /** Optional first-paint extent. The main map uses this for a responsive
   *  whole-county opening instead of guessing one zoom for every screen. */
  initialBounds?: [[number, number], [number, number]];
  /** Padding around a supplied first-paint extent. Subject maps do not have
   *  the browse dock, so they can use the map area more efficiently. */
  initialBoundsPadding?:
    | number
    | { top: number; right: number; bottom: number; left: number };
  /** Browse-only camera constraints; embeds keep AppMap's tighter defaults. */
  cameraMinZoom?: number;
  cameraMaxBounds?: [[number, number], [number, number]];
  /** A small, single-subject overview (for example, every brewery). Pins are
   *  clustered at county zoom, remain tappable, and skip irrelevant controls. */
  compactSubjectMap?: boolean;
  /** Amenity-tray group keys to pre-activate (a /map?amenity=restroom
   *  deep-link from /amenities or /today). Forwarded to AppMap. */
  initialAmenityGroups?: string[];
  /** Browse-view state + counts for the map dock (/map browse only).
   *  Forwarded to AppMap; absent on embeds, which stay dock-less. */
  dock?: BrowseDockInfo;
  /** Slugs matching the active What/Open-now filter — the map fades the
   *  rest instead of removing them. Forwarded to AppMap. */
  activeSlugs?: string[] | null;
  /** Dock-less embeds normally inherit the full map search deck. Set false
   *  when the surrounding page already defines the map's single purpose
   *  (for example, breweries or trails). Locate and camera controls remain. */
  showSearchControls?: boolean;
  /** Browse-only request path for optional provider-backed layer groups. */
  onLayerDemand?: (groups: readonly MapLayerGroup[]) => void;
  /** Overlay content for the map column. (Historically the intent-chip
   *  strip; the dock replaced it — the slot stays for future overlays.) */
  children?: ReactNode;
}) {
  // Keep the branded map scene in this light wrapper, outside the deferred
  // Mapbox bundle. That makes it part of the initial HTML instead of waiting
  // several seconds for the large GL chunk before showing any map content.
  const [mapVisualReady, setMapVisualReady] = useState(false);
  const [mapChunkLoaded, setMapChunkLoaded] = useState(appMapChunkReady);
  const [mapChunkFailed, setMapChunkFailed] = useState(false);
  const hasReportedMapVisualReady = useRef(false);
  const handleMapVisualReady = useCallback(() => {
    if (hasReportedMapVisualReady.current) return;
    hasReportedMapVisualReady.current = true;
    setMapVisualReady(true);
  }, []);
  const handleMapChunkFailure = useCallback(() => {
    setMapChunkFailed(true);
    handleMapVisualReady();
  }, [handleMapVisualReady]);

  useEffect(() => {
    if (mapChunkLoaded || mapChunkFailed) return;
    const unsubscribe = subscribeToAppMapChunkReady(() => {
      setMapChunkLoaded(true);
    });
    const timeout = window.setTimeout(
      handleMapChunkFailure,
      APP_MAP_CHUNK_TIMEOUT_MS,
    );
    return () => {
      unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [handleMapChunkFailure, mapChunkFailed, mapChunkLoaded]);

  const trailLineOnlyFailure =
    trailsLayerDefault &&
    places.length === 0 &&
    events.length === 0 &&
    trailLines.features.length > 0;

  // The in-view list panel (the desktop side pane + the mobile slide-up
  // "60 places · N open now · N events nearby" drawer) was removed per the
  // owner: the map IS the page. Tap a pin for its card; no bottom panel
  // narrating what's in view. Just the map with the chips/mode-toggle overlaid.
  if (fullBleed) {
    return (
      <div className="relative h-full w-full">
        <MapLoadingScene height="100%" ready={mapVisualReady} />
        {children}
        {mapChunkFailed ? (
          <MapLoadFailure
            height="100%"
            places={places}
            events={events}
            trailLineOnly={trailLineOnlyFailure}
          />
        ) : (
        <MapChunkBoundary
          onFailure={handleMapChunkFailure}
          fallback={
            <MapLoadFailure
              height="100%"
              places={places}
              events={events}
              trailLineOnly={trailLineOnlyFailure}
            />
          }
        >
          <AppMap
            places={places}
            civic={civic}
            extraAmenities={extraAmenities}
            amenities={amenities}
            trailLines={trailLines}
            trailsLayerDefault={trailsLayerDefault}
            transitLines={transitLines}
            municipalBoundaries={municipalBoundaries}
            countyBoundary={countyBoundary}
            cemeteries={cemeteries}
            parking={parking}
            events={events}
            transitStops={transitStops}
            marcStations={marcStations}
            foodTruckPins={foodTruckPins}
            roadWorkZones={roadWorkZones}
            floodContext={floodContext}
            snowRoutes={snowRoutes}
            fullBleed
            recenterToKnownLocation={recenterToKnownLocation}
            pinpointDefault={pinpointDefault}
            initialCenter={initialCenter}
            initialZoom={initialZoom}
            initialBounds={initialBounds}
            initialBoundsPadding={initialBoundsPadding}
            cameraMinZoom={cameraMinZoom}
            cameraMaxBounds={cameraMaxBounds}
            compactSubjectMap={compactSubjectMap}
            initialAmenityGroups={initialAmenityGroups}
            dock={dock}
            activeSlugs={activeSlugs}
            showSearchControls={showSearchControls}
            onVisualReady={handleMapVisualReady}
            smartDefault={smartDefault}
            sceneContext={sceneContext}
            onLayerDemand={onLayerDemand}
          />
        </MapChunkBoundary>
        )}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden" style={{ height: EMBEDDED_MAP_HEIGHT }}>
      <MapLoadingScene
        height={EMBEDDED_MAP_HEIGHT}
        ready={mapVisualReady}
      />
      {mapChunkFailed ? (
        <MapLoadFailure
          height={EMBEDDED_MAP_HEIGHT}
          places={places}
          events={events}
          trailLineOnly={trailLineOnlyFailure}
        />
      ) : (
      <MapChunkBoundary
        onFailure={handleMapChunkFailure}
        fallback={
          <MapLoadFailure
            height={EMBEDDED_MAP_HEIGHT}
            places={places}
            events={events}
            trailLineOnly={trailLineOnlyFailure}
          />
        }
      >
        <AppMap places={places} civic={civic} extraAmenities={extraAmenities} amenities={amenities} trailLines={trailLines} trailsLayerDefault={trailsLayerDefault} transitLines={transitLines} municipalBoundaries={municipalBoundaries} countyBoundary={countyBoundary} cemeteries={cemeteries} events={events} foodTruckPins={foodTruckPins} roadWorkZones={roadWorkZones} floodContext={floodContext} snowRoutes={snowRoutes} height={EMBEDDED_MAP_HEIGHT} initialCenter={initialCenter} initialZoom={initialZoom} initialBounds={initialBounds} initialBoundsPadding={initialBoundsPadding} cameraMinZoom={cameraMinZoom} cameraMaxBounds={cameraMaxBounds} compactSubjectMap={compactSubjectMap} initialAmenityGroups={initialAmenityGroups} showSearchControls={showSearchControls} onVisualReady={handleMapVisualReady} />
      </MapChunkBoundary>
      )}
    </div>
  );
}

/**
 * Sort comparator for the in-view places list. NEUTRAL by design — it is a
 * reflection of what's on the map, NOT a "best in view" ranking. There is no
 * editorial/quality (feature_score) tier, so the app never picks winners. Two
 * factual tiers:
 *   1. Open now beats closed — a closed place is no help to someone here now.
 *   2. Nearer beats farther.
 * Pure + total, so both presentations sort identically. Exported for tests.
 */
export function rankInView(a: PlaceCardData, b: PlaceCardData): number {
  const ao = isOpenNow(a.open_status) ? 1 : 0;
  const bo = isOpenNow(b.open_status) ? 1 : 0;
  if (ao !== bo) return bo - ao;
  return (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity);
}

/** An amenity decorated with its distance from the nearest visible place. */
export type UsefulAmenity = Amenity & { distance_m: number };

/**
 * The "Useful nearby" set: practical infrastructure (restrooms, water,
 * EV, bike parking, Wi-Fi, playgrounds…) within a short walk of what's
 * currently in view. Mirrors eventsNearVisiblePlaces — an amenity counts
 * if it sits within `maxMeters` of ANY visible place — but then keeps
 * only the NEAREST one per kind, so the row reads as a checklist of what's
 * handy ("restroom · water · EV") rather than a stack of identical pins.
 * Tighter radius than events (800m vs 1.5km): "useful nearby" should mean
 * a genuinely short walk. Nearest-kind first. Exported for unit tests.
 *
 * Data limits worth knowing: parking is a place *category*, not an
 * amenity, so it shows up in the places list, not here; transit stops
 * aren't in the AmenityKind set yet (docs/BACKLOG.md), so transit is
 * absent until that data is plumbed in.
 */
export function amenitiesNearVisiblePlaces(
  amenities: Amenity[],
  visible: { geom: { lng: number; lat: number } }[],
  maxMeters = 800,
): UsefulAmenity[] {
  if (amenities.length === 0 || visible.length === 0) return [];
  // Nearest match per kind.
  const best = new Map<AmenityKind, UsefulAmenity>();
  for (const a of amenities) {
    if (!Number.isFinite(a.lng) || !Number.isFinite(a.lat)) continue;
    let nearest = Infinity;
    for (const p of visible) {
      const d = haversineMeters({ lng: a.lng, lat: a.lat }, p.geom);
      if (d < nearest) nearest = d;
    }
    if (nearest > maxMeters) continue;
    const cur = best.get(a.kind);
    if (!cur || nearest < cur.distance_m) {
      best.set(a.kind, { ...a, distance_m: nearest });
    }
  }
  return [...best.values()].sort((x, y) => x.distance_m - y.distance_m);
}

/**
 * Filter events to those near the visible viewport. We use the set of
 * places currently in view as a proxy for the viewport: an event is
 * "nearby" if its venue sits within 1.5km of ANY place the user can
 * see. This works without plumbing a separate onEventsInView signal
 * out of AppMap, and degrades sensibly when the viewport is sparse
 * (zero visible places → no nearby events, which is the right answer:
 * if the user can't see anything to do, they can't see anywhere to
 * go either).
 *
 * Exported for unit tests (the in-view panel that consumed it at runtime was
 * removed; the helper is kept for the test contract + future reuse).
 */
export function eventsNearVisiblePlaces(
  events: EventPin[],
  visible: { geom: { lng: number; lat: number } }[],
  maxMeters = 1500,
): EventPin[] {
  if (events.length === 0 || visible.length === 0) return [];
  const out: EventPin[] = [];
  for (const e of events) {
    if (!Number.isFinite(e.lng) || !Number.isFinite(e.lat)) continue;
    for (const p of visible) {
      const d = haversineMeters({ lng: e.lng, lat: e.lat }, p.geom);
      if (d <= maxMeters) {
        out.push(e);
        break; // matched at least one — don't double-add
      }
    }
  }
  return out;
}
