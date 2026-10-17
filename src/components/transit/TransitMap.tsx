"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapIcon,
  MapPin,
} from "lucide-react";
import Map, {
  Source,
  Layer,
  AttributionControl,
  Popup,
  Marker,
  type MapMouseEvent,
  type MapRef,
} from "react-map-gl/mapbox";
import { FREDERICK_COUNTY_BBOX } from "@/lib/geo";
import styles from "./TransitExperience.module.css";
import { ACCENTS } from "@/data/categories";
import { BRAND } from "@/lib/brand";
import {
  applyMapboxFieldGuideConfig,
  installMapboxFieldGuideTerrain,
  MAPBOX_FIELD_GUIDE_CONFIG,
  MAPBOX_FIELD_GUIDE_STYLE,
  MAPBOX_LABEL_FONT_MEDIUM,
} from "@/components/map/mapboxFieldGuideStyle";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { hasWebGL } from "@/components/map/mapCameraHelpers";
import LiveBuses from "@/components/map/LiveBuses";
import { exposeMarkerChild } from "@/components/map/markerA11y";
import {
  createLiveLayerCloserRegistry,
  type LiveLayerGate,
} from "@/components/map/liveLayerGate";
import LiveMarcTrains from "@/components/map/LiveMarcTrains";
import StopArrivalsPopup, { type SelectedStop } from "./StopArrivalsPopup";
import { haptic } from "@/lib/haptics";
import type { LineFC, TransitStop } from "@/lib/integrations/transitFrederick";
import {
  clearPendingTransitRouteFocus,
  clearPendingTransitStopFocus,
  clearPendingTransitVehicleFocus,
  isTransitVehicleFocusDetail,
  isTransitStopFocusDetail,
  requestTransitStopFocus,
  takePendingTransitRouteFocus,
  takePendingTransitStopFocus,
  takePendingTransitVehicleFocus,
  TRANSIT_ROUTE_FOCUS_EVENT,
  TRANSIT_STOP_FOCUS_EVENT,
  TRANSIT_VEHICLE_FOCUS_EVENT,
  type TransitRouteFocusDetail,
  type TransitStopFocusDetail,
  type TransitVehicleFocusDetail,
} from "@/lib/transit-focus";
import { MARC_STATIONS } from "@/data/marc-stations";
import TRANSIT from "@/data/transit.json";
import TRANSIT_NETWORK from "@/data/transit-network.json";
import { CURRENT_TRANSIT_STOPS } from "@/lib/transit-static";
import "mapbox-gl/dist/mapbox-gl.css";
import { isFatalMapboxError } from "@/components/map/mapboxFailure";

type TRoute = { id: string; short: string; name: string; color: string };
const ROUTES = TRANSIT.routes as TRoute[];
const SHAPES = TRANSIT.shapes as Record<string, number[][]>;
type ShapeVariant = { id: string; points: number[][] };
const SHAPE_VARIANTS = (
  TRANSIT_NETWORK as {
    shapeVariants?: Record<string, ShapeVariant[]>;
  }
).shapeVariants ?? {};
const SHAPE_LINES_BY_ROUTE: Record<string, number[][][]> = Object.fromEntries(
  ROUTES.map((route) => {
    const variants = SHAPE_VARIANTS[route.id]
      ?.map((variant) => variant.points)
      .filter((points) => points.length >= 2);
    return [
      route.id,
      variants && variants.length > 0
        ? variants
        : SHAPES[route.id]
          ? [SHAPES[route.id]]
          : [],
    ];
  }),
);
// Only static GTFS stops with current stop_time membership are rider-selectable.
// They retain the stop_id the realtime feed keys on, so a tap can join to live
// arrivals without offering announcement-only or discontinued stop records.
const STOPS_JSON: TransitStop[] = CURRENT_TRANSIT_STOPS.map((stop) => ({
  id: stop.id,
  name: stop.name,
  lng: stop.lng,
  lat: stop.lat,
}));

const STOP_BY_ID: Record<string, SelectedStop> = Object.fromEntries(
  STOPS_JSON.map((stop) => [stop.id, stop]),
);
const STOP_ROUTES = (
  TRANSIT_NETWORK as { stopRoutes?: Record<string, string[]> }
).stopRoutes ?? {};

const MAP_LOAD_WATCHDOG_MS = 18_000;
type ActiveVehicleFocus = TransitVehicleFocusDetail & {
  requestId: number;
};

type TransitMapInstance = ReturnType<MapRef["getMap"]>;

function frameVehicleAndStop(
  map: TransitMapInstance,
  detail: TransitVehicleFocusDetail,
  stopCallout = false,
): void {
  let west = Math.min(detail.bus.lng, detail.stop.lng);
  let east = Math.max(detail.bus.lng, detail.stop.lng);
  let south = Math.min(detail.bus.lat, detail.stop.lat);
  let north = Math.max(detail.bus.lat, detail.stop.lat);
  // Mapbox needs a non-zero box when a bus is reporting at the stop.
  if (east - west < 0.0008) {
    west -= 0.0004;
    east += 0.0004;
  }
  if (north - south < 0.0008) {
    south -= 0.0004;
    north += 0.0004;
  }
  const reduced =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ??
    false;
  map.fitBounds(
    [[west, south], [east, north]],
    {
      padding: stopCallout ? { top: 120, right: 54, bottom: 54, left: 54 } : 54,
      maxZoom: 15,
      duration: reduced ? 0 : 500,
    },
  );
}

/**
 * The transit SERVICE AREA — the bounding box of every route polyline (the real
 * extent where buses actually run), padded slightly. Used to leash the live-bus
 * map so it can't be panned off into empty county where nothing moves. Shape
 * points are [lat, lng]; MapLibre maxBounds are flat [west, south, east, north].
 */
const SERVICE_BOUNDS: [number, number, number, number] = (() => {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const routeLines of Object.values(SHAPE_LINES_BY_ROUTE)) {
    for (const points of routeLines) {
      for (const p of points) {
        const lat = p[0], lng = p[1];
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  // Sensible fallback (downtown Frederick) if shapes are somehow empty.
  if (!Number.isFinite(minLng)) return [-77.50, 39.34, -77.32, 39.50];
  const padLng = (maxLng - minLng) * 0.06 || 0.02;
  const padLat = (maxLat - minLat) * 0.06 || 0.02;
  return [minLng - padLng, minLat - padLat, maxLng + padLng, maxLat + padLat];
})();

/**
 * TransitMap — Carroll-Creek-slate route lines drawn on the same
 * Frederick-palette Mapbox base the rest of the app uses.
 *
 * Visual choices
 *   - One Source with the caller's route network. No per-route color — every line
 *     paints in --app-cool (Carroll Creek slate) so the network
 *     reads as a single transit system at a glance. Adding 36
 *     distinct colors would turn the map into spaghetti.
 *   - 3px line with 70% opacity. Heavy enough to read on the warm
 *     base tiles, light enough that the underlying streets show
 *     through so the user can orient.
 *   - The base is the same self-hosted Frederick Radius flavor every
 *     other map in the app draws, so the ground feels identical
 *     across /map, /radius, /m/[slug], and /transit.
 *   - Interactive: drag, pinch, and double-tap zoom on. Cooperative
 *     gestures off because route inspection is the whole point
 *     and a pinch-to-zoom hint would compete with the route lines.
 *
 * Honest sourcing: route shapes are supplied by the server page. /transit
 * prefers the official static GTFS snapshot and uses Maryland Open Data only
 * as a fallback; other map surfaces can still supply their reviewed overlay.
 * Interactive stop locations and ids come from the committed static TransIT
 * GTFS snapshot. Vehicle positions and arrival estimates are separate
 * GTFS-realtime data.
 */
export default function TransitMap({
  shapes,
  stops = [],
  height = 380,
  center,
  zoom,
  liveBuses = false,
  highlightRoutes = false,
  hideBadge = false,
  lockToService = false,
  interactiveStops = false,
  showTrains = true,
}: {
  shapes: LineFC;
  /** Real Frederick County TransIT stops (MD Open Data, 4zcx-89nc).
   *  Each rendered as a small Carroll-Creek-slate dot. Pre-launch the
   *  /transit page had only route lines; stops are the second half
   *  of "what does the network look like" — the question "where do
   *  I catch the bus" now has a visible answer. */
  stops?: TransitStop[];
  height?: number | string;
  /** Initial center [lng, lat]; defaults to the county centroid. */
  center?: [number, number];
  /** Initial zoom; defaults to 9 (county-wide). */
  zoom?: number;
  /** Overlay live TransIT vehicle positions (LiveBuses). */
  liveBuses?: boolean;
  /** Show the route-highlighter chip strip: tap a route to draw its path in
   *  its color and dim the other buses. */
  highlightRoutes?: boolean;
  /** Hide the in-map "TransIT · N routes" pill (when a section header already
   *  labels the map, e.g. /pulse — keeps the top clear for bus badges). */
  hideBadge?: boolean;
  /** Leash the camera to the bus SERVICE AREA (the route-network bbox) so the
   *  map can't be panned/zoomed off into empty county where no buses run. With
   *  an explicit `center`/`zoom` the map OPENS there (e.g. /pulse → downtown
   *  Frederick); without one it frames the whole service area on load. Used by
   *  the /pulse live-bus map. */
  lockToService?: boolean;
  /** Render current membership-backed static GTFS stops as tappable dots. A
   *  tap opens the stop's name and live inbound arrivals. Off by default (the
   *  /pulse map stays a clean live-bus view). */
  interactiveStops?: boolean;
  /** Overlay live MARC train positions alongside the buses. On by default so
   *  /transit shows rail; /pulse sets it false to stay a pure live-bus view. */
  showTrains?: boolean;
}) {
  const mapRef = useRef<MapRef>(null);
  const mapLoadedRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  useEffect(() => {
    if (shapes.features.length === 0) return;
    const check = window.setTimeout(() => {
      if (!MAPBOX_TOKEN || !hasWebGL()) setMapFailed(true);
    }, 0);
    return () => window.clearTimeout(check);
  }, [shapes.features.length]);
  // Style requests can stall without a reliable Mapbox error event. A bounded
  // wait keeps the route picker and the rest of the transit page usable.
  useEffect(() => {
    if (shapes.features.length === 0 || mapLoaded || mapFailed) return;
    const watchdog = window.setTimeout(
      () => setMapFailed(true),
      MAP_LOAD_WATCHDOG_MS,
    );
    return () => window.clearTimeout(watchdog);
  }, [mapFailed, mapLoaded, shapes.features.length]);
  const initial = useMemo(() => {
    const cx = center?.[0] ?? (FREDERICK_COUNTY_BBOX.west + FREDERICK_COUNTY_BBOX.east) / 2;
    const cy = center?.[1] ?? (FREDERICK_COUNTY_BBOX.south + FREDERICK_COUNTY_BBOX.north) / 2;
    // Tighter than CountyOverview so downtown's dense route cluster reads
    // cleanly from the start; the user can zoom out for the outer routes.
    return { longitude: cx, latitude: cy, zoom: zoom ?? 9 };
  }, [center, zoom]);

  // Route highlighter: the selected route id (null = show all). The selected
  // route's path is drawn from the GTFS shapes (transit.json), keyed by route.
  const [route, setRoute] = useState<string | null>(null);
  const focusRequestSeq = useRef(0);
  const [vehicleFocus, setVehicleFocus] =
    useState<ActiveVehicleFocus | null>(null);
  const [activeStop, setActiveStop] = useState<SelectedStop | null>(() => {
    if (typeof window === "undefined" || !interactiveStops) return null;
    const stopId = new URLSearchParams(window.location.search).get("stop");
    return stopId ? STOP_BY_ID[stopId] ?? null : null;
  });
  const [stopPreviewOpen, setStopPreviewOpen] = useState(false);
  const [foregroundOpen, setForegroundOpen] = useState(false);
  const [routeFocusRequest, setRouteFocusRequest] = useState<{
    routeId: string;
    requestId: number;
  } | null>(null);
  const [stopFocusRequest, setStopFocusRequest] = useState<{
    stop: SelectedStop;
    requestId: number;
  } | null>(null);
  const activeStopButtonRef = useRef<HTMLButtonElement>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const closerRegistry = useMemo(() => createLiveLayerCloserRegistry(), []);
  const closeForeground = useCallback((restoreFocus = false) => {
    closerRegistry.closeAll();
    setStopPreviewOpen(false);
    setForegroundOpen(false);
    setVehicleFocus(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        const trigger = previewTriggerRef.current;
        (trigger?.isConnected ? trigger : activeStopButtonRef.current)
          ?.focus({ preventScroll: true });
      });
    }
  }, [closerRegistry]);
  const liveGate = useMemo<LiveLayerGate>(() => ({
    register: closerRegistry.register,
    onWillOpen: () => {
      previewTriggerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      closeForeground();
      setForegroundOpen(true);
    },
    onDidClose: () => closeForeground(true),
  }), [closerRegistry, closeForeground]);
  const openStopPreview = useCallback((stop: SelectedStop, trigger: HTMLElement | null = null) => {
    previewTriggerRef.current = trigger;
    clearPendingTransitRouteFocus();
    clearPendingTransitVehicleFocus();
    clearPendingTransitStopFocus();
    closeForeground();
    setActiveStop(stop);
    setRoute((current) => current && STOP_ROUTES[stop.id]?.includes(current) ? current : null);
    setRouteFocusRequest(null);
    setStopFocusRequest(null);
    setStopPreviewOpen(true);
    setForegroundOpen(true);
    haptic("light");
  }, [closeForeground]);
  useEffect(() => {
    if (!foregroundOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeForeground(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [foregroundOpen, closeForeground]);
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded || !stopFocusRequest) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    map.flyTo({
      center: [stopFocusRequest.stop.lng, stopFocusRequest.stop.lat],
      zoom: Math.max(map.getZoom(), 14.5),
      duration: reduced ? 0 : 500,
    });
    activeStopButtonRef.current?.focus({ preventScroll: true });
  }, [mapLoaded, stopFocusRequest]);
  const selMeta = route ? ROUTES.find((r) => r.id === route) : null;
  const selLine = useMemo(() => {
    if (!route) return null;
    const routeLines = SHAPE_LINES_BY_ROUTE[route];
    if (!routeLines || routeLines.length === 0) return null;
    const feature: GeoJSON.Feature<GeoJSON.MultiLineString> = {
      type: "Feature" as const,
      geometry: {
        type: "MultiLineString" as const,
        coordinates: routeLines.map((points) =>
          points.map(([lat, lng]) => [lng, lat]),
        ),
      },
      properties: {},
    };
    return feature;
  }, [route]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded || !routeFocusRequest) return;
    const routeLines = SHAPE_LINES_BY_ROUTE[routeFocusRequest.routeId];
    if (!routeLines || routeLines.length === 0) return;

    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const points of routeLines) {
      for (const [lat, lng] of points) {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        west = Math.min(west, lng);
        east = Math.max(east, lng);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
    }
    if (![west, south, east, north].every(Number.isFinite)) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    map.fitBounds(
      [[west, south], [east, north]],
      { padding: activeStop ? { top: 120, right: 54, bottom: 54, left: 54 } : 54, duration: reduced ? 0 : 500 },
    );
  }, [activeStop, mapLoaded, routeFocusRequest]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !vehicleFocus) return;
    frameVehicleAndStop(map, vehicleFocus, interactiveStops && Boolean(activeStop));
  }, [activeStop, interactiveStops, vehicleFocus]);

  // The compact route finder below the map uses the same route state instead
  // of acting like a second, disconnected catalog. Selecting a result focuses
  // the route here and lets the existing fitBounds effect frame it.
  useEffect(() => {
    const applyRoute = (routeId: string | null | undefined) => {
      if (!routeId || !ROUTES.some((item) => item.id === routeId)) return;
      clearPendingTransitRouteFocus();
      clearPendingTransitStopFocus();
      clearPendingTransitVehicleFocus();
      closeForeground();
      setStopFocusRequest(null);
      setActiveStop((stop) => stop && STOP_ROUTES[stop.id]?.includes(routeId) ? stop : null);
      setRoute(routeId);
      focusRequestSeq.current += 1;
      setRouteFocusRequest({ routeId, requestId: focusRequestSeq.current });
    };
    const applyVehicle = (
      detail: TransitVehicleFocusDetail | null | undefined,
    ) => {
      if (!detail || !isTransitVehicleFocusDetail(detail)) return;
      clearPendingTransitVehicleFocus();
      clearPendingTransitRouteFocus();
      clearPendingTransitStopFocus();
      previewTriggerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      closeForeground();
      setStopFocusRequest(null);
      setRouteFocusRequest(null);
      setActiveStop(detail.stopId ? STOP_BY_ID[detail.stopId] ?? null : null);
      setForegroundOpen(true);
      focusRequestSeq.current += 1;
      setVehicleFocus({
        ...detail,
        requestId: focusRequestSeq.current,
      });
      setRoute(
        detail.routeId &&
          ROUTES.some((item) => item.id === detail.routeId)
          ? detail.routeId
          : null,
      );
    };
    const applyStop = (detail: TransitStopFocusDetail | null | undefined) => {
      if (!interactiveStops || !isTransitStopFocusDetail(detail)) return;
      const stop = STOP_BY_ID[detail.stopId];
      if (!stop) return;
      clearPendingTransitStopFocus();
      clearPendingTransitRouteFocus();
      clearPendingTransitVehicleFocus();
      closeForeground();
      setRouteFocusRequest(null);
      setActiveStop(stop);
      setRoute((current) => current && STOP_ROUTES[stop.id]?.includes(current) ? current : null);
      if (detail.selectForRider) {
        // The map is already at this preview. The rider returns to My stop.
        setStopFocusRequest(null);
      } else {
        focusRequestSeq.current += 1;
        setStopFocusRequest({ stop, requestId: focusRequestSeq.current });
      }
    };
    const focusStop = (event: Event) => {
      applyStop((event as CustomEvent<TransitStopFocusDetail>).detail);
    };
    const focusRoute = (event: Event) => {
      applyRoute((event as CustomEvent<TransitRouteFocusDetail>).detail?.routeId);
    };
    const focusVehicle = (event: Event) => {
      applyVehicle(
        (event as CustomEvent<TransitVehicleFocusDetail>).detail,
      );
    };
    window.addEventListener(TRANSIT_STOP_FOCUS_EVENT, focusStop);
    window.addEventListener(TRANSIT_ROUTE_FOCUS_EVENT, focusRoute);
    window.addEventListener(TRANSIT_VEHICLE_FOCUS_EVENT, focusVehicle);
    const pendingVehicle = takePendingTransitVehicleFocus();
    const pendingStop = takePendingTransitStopFocus();
    const pendingRoute = takePendingTransitRouteFocus();
    if (pendingVehicle) applyVehicle(pendingVehicle);
    else if (pendingStop) applyStop(pendingStop);
    else applyRoute(pendingRoute);
    return () => {
      window.removeEventListener(TRANSIT_STOP_FOCUS_EVENT, focusStop);
      window.removeEventListener(TRANSIT_ROUTE_FOCUS_EVENT, focusRoute);
      window.removeEventListener(
        TRANSIT_VEHICLE_FOCUS_EVENT,
        focusVehicle,
      );
    };
  }, [closeForeground, interactiveStops]);

  const [cursor, setCursor] = useState("");
  const renderStops = interactiveStops ? STOPS_JSON : stops;
  // Static stop_times membership is map context, never a live-service claim.
  const stopDots = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: "FeatureCollection",
    features: renderStops.map((stop) => ({
      type: "Feature",
      properties: {
        id: stop.id,
        name: stop.name,
        onSelectedRoute: route ? STOP_ROUTES[stop.id]?.includes(route) === true : true,
      },
      geometry: { type: "Point", coordinates: [stop.lng, stop.lat] },
    })),
  }), [renderStops, route]);

  const onMapClick = (event: MapMouseEvent) => {
    const map = mapRef.current?.getMap();
    const candidates = event.features?.filter(
      (feature) => feature.layer?.id === "transit-stops-hit" && feature.geometry.type === "Point",
    ) ?? [];
    // Overlapping invisible targets choose the closest actual stop dot.
    const closest = candidates.sort((a, b) => {
      if (!map || a.geometry.type !== "Point" || b.geometry.type !== "Point") return 0;
      const pa = map.project(a.geometry.coordinates as [number, number]);
      const pb = map.project(b.geometry.coordinates as [number, number]);
      return Math.hypot(pa.x - event.point.x, pa.y - event.point.y)
        - Math.hypot(pb.x - event.point.x, pb.y - event.point.y);
    })[0];
    const stop = closest?.properties?.id != null
      ? STOP_BY_ID[String(closest.properties.id)]
      : undefined;
    if (stop) openStopPreview(stop);
    else closeForeground();
  };

  // No routes means the upstream feed failed. Render a quiet empty
  // state instead of a blank map.
  if (shapes.features.length === 0) {
    return (
      <div
        className="grid place-items-center rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-sunken)] p-6 text-center text-[13px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)", height }}
      >
        Route shapes are temporarily unavailable.
      </div>
    );
  }

  const shapeSourceLabel =
    shapes.sourceLabel ??
    (typeof shapes.features[0]?.properties.source === "string"
      ? shapes.features[0].properties.source
      : "TransIT route data");

  return (
    <div className={styles.mapShell}>
      {highlightRoutes && (
        <div className={styles.mapPicker}>
          <p id="transit-route-context" className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            {selMeta
              ? `Route ${selMeta.short} shows published stops. Choose one to check arrivals.`
              : "Choose a route or select a stop to check arrivals."}
          </p>
          <label>
            <span className="sr-only">Bus route</span>
            <select
              value={route ?? ""}
              aria-describedby="transit-route-context"
              onChange={(event) => {
                closeForeground();
                clearPendingTransitRouteFocus();
                clearPendingTransitVehicleFocus();
                clearPendingTransitStopFocus();
                setStopFocusRequest(null);
                const nextRoute = event.target.value || null;
                setRoute(nextRoute);
                focusRequestSeq.current += 1;
                setRouteFocusRequest(nextRoute ? { routeId: nextRoute, requestId: focusRequestSeq.current } : null);
                setActiveStop((stop) => stop && (!nextRoute || STOP_ROUTES[stop.id]?.includes(nextRoute)) ? stop : null);
              }}
              className={styles.routeSelect}
            >
              <option value="">All routes</option>
              {ROUTES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.short} · {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div
        className={`transit-map-canvas ${styles.mapFrame}`}
        style={{ height }}
      >
      {mapFailed ? (
        <div
          role="alert"
          aria-label="Transit map unavailable"
          className={styles.mapFallback}
        >
          <div className="max-w-sm">
            <MapIcon
              className="mx-auto h-7 w-7"
              style={{ color: "var(--app-cool)" }}
              strokeWidth={1.5}
              aria-hidden
            />
            <p
              className="mt-2 text-[13px] font-semibold"
              style={{ color: "var(--app-ink)" }}
            >
              The transit map is temporarily unavailable
            </p>
            <p
              className="mt-1 text-[12px] leading-relaxed"
              style={{ color: "var(--app-ink-3)" }}
            >
              {activeStop ? `${activeStop.name} remains selected. ` : selMeta ? `${selMeta.short} · ${selMeta.name} remains selected. ` : ""}
              The route and arrival information on this page is still available.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={styles.mapRetry}
            >
              Try the map again
            </button>
          </div>
        </div>
      ) : (
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAPBOX_FIELD_GUIDE_STYLE}
        config={MAPBOX_FIELD_GUIDE_CONFIG}
        initialViewState={initial}
        style={{ width: "100%", height: "100%" }}
        // Drag + pinch on; cooperative gestures off so a single-finger
        // pan works without the "use two fingers" hint.
        interactive
        cooperativeGestures={false}
        attributionControl={false}
        logoPosition="bottom-left"
        maxBounds={lockToService ? SERVICE_BOUNDS : undefined}
        minZoom={lockToService ? 10.5 : undefined}
        interactiveLayerIds={interactiveStops ? ["transit-stops-hit"] : undefined}
        cursor={cursor}
        onMouseEnter={interactiveStops ? () => setCursor("pointer") : undefined}
        onMouseLeave={interactiveStops ? () => setCursor("") : undefined}
        onClick={interactiveStops ? onMapClick : undefined}
        onError={(e) => {
          const msg = String(e?.error?.message ?? "").toLowerCase();
          if (isFatalMapboxError(msg, mapLoadedRef.current)) {
            setMapFailed(true);
          }
        }}
        onLoad={(e) => {
          mapLoadedRef.current = true;
          setMapLoaded(true);
          applyMapboxFieldGuideConfig(e.target);
          installMapboxFieldGuideTerrain(e.target);
          // With an explicit center (e.g. /pulse → downtown Frederick) we open
          // THERE — the maxBounds leash still keeps the camera over the service
          // area, the user can zoom out for outlying buses. Without a center,
          // frame the whole service area so the map still lands where buses run
          // instead of the empty county.
          if (vehicleFocus) {
            frameVehicleAndStop(e.target, vehicleFocus, interactiveStops && Boolean(activeStop));
          } else if (activeStop) {
            e.target.jumpTo({ center: [activeStop.lng, activeStop.lat], zoom: 14.5 });
          } else if (lockToService && !center) {
            e.target.fitBounds(SERVICE_BOUNDS, { padding: 24, duration: 0 });
          }
        }}
      >
        <AttributionControl compact position="bottom-right" />
        {/* LineFC types geometry as `unknown` to stay defensive at each
            upstream boundary, while Mapbox's Source needs strict GeoJSON.
            Cast only here after the server-side normalizer has kept line
            features. */}
        <Source
          id="transit-routes"
          type="geojson"
          data={shapes as unknown as GeoJSON.FeatureCollection}
        >
          {/* Soft halo underneath the main line so a route stays
              legible where it crosses water, highways, or its own
              variations. Wider, paler, drawn first. */}
          <Layer
            id="transit-routes-halo"
            type="line"
            paint={{
              "line-color": "#ffffff",
              "line-width": route ? 3 : 5,
              "line-opacity": route ? 0.3 : 0.55,
              "line-blur": 0.5,
            }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
          />
          <Layer
            id="transit-routes-line"
            type="line"
            paint={{
              // Carroll Creek slate, the brand's "calm civic" hue. GL paint
              // can't read CSS vars, so the shared ACCENTS constant keeps
              // the map on-token (slate === --app-cool).
              "line-color": ACCENTS.slate,
              "line-width": route ? 1.5 : 2.5,
              "line-opacity": route ? 0.18 : 0.65,
            }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
          />
        </Source>

        {/* One selected official route stays distinct from the quiet network. */}
        {selLine && selMeta && (
          <Source id="transit-route-highlight" type="geojson" data={selLine}>
            <Layer
              id="transit-route-highlight-halo"
              type="line"
              paint={{ "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.9 }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
            <Layer
              id="transit-route-highlight-contrast"
              type="line"
              paint={{ "line-color": BRAND.colors.ink, "line-width": 6.5, "line-opacity": 0.85 }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
            <Layer
              id="transit-route-highlight-line"
              type="line"
              paint={{ "line-color": selMeta.color, "line-width": 4.5, "line-opacity": 1 }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
          </Source>
        )}

        {/* All ordinary stops stay in one GPU source at every zoom. Only the
            active stop gets a DOM control, keeping buses easy to distinguish. */}
        {renderStops.length > 0 && (
          <Source id="transit-stops" type="geojson" data={stopDots}>
            <Layer
              id="transit-stops-dots"
              type="circle"
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 1.5, 11, 2.5, 14, 4, 17, 5],
                "circle-color": ACCENTS.slate,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.2,
                "circle-opacity": ["case", ["get", "onSelectedRoute"], 0.85, 0.16],
                "circle-stroke-opacity": ["case", ["get", "onSelectedRoute"], 0.9, 0.2],
              }}
            />
            {interactiveStops && (
              <Layer
                id="transit-stops-hit"
                type="circle"
                paint={{
                  "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 7, 12, 14, 15, 22],
                  "circle-color": ACCENTS.slate,
                  "circle-opacity": 0,
                }}
              />
            )}
          </Source>
        )}
        {activeStop && interactiveStops && (
          <Marker
            ref={exposeMarkerChild}
            longitude={activeStop.lng}
            latitude={activeStop.lat}
            anchor="bottom"
            style={{ zIndex: 3, pointerEvents: "none" }}
          >
            {/* The callout points to the real stop dot while leaving a bus
                reporting at the same coordinate independently tappable. */}
            <span className={styles.activeStopCallout}>
            <button
              ref={activeStopButtonRef}
              type="button"
              className={styles.activeStopMarker}
              data-transit-active-stop={activeStop.id}
              aria-label={`Show arrivals at ${activeStop.name}`}
              aria-expanded={stopPreviewOpen}
              onClick={(event) => {
                event.stopPropagation();
                if (stopPreviewOpen) closeForeground(true);
                else openStopPreview(activeStop, event.currentTarget);
              }}
            >
              <MapPin size={20} strokeWidth={2.2} aria-hidden />
              <span className={styles.activeStopLabel} aria-hidden>{activeStop.name}</span>
            </button>
            <span className={styles.activeStopStem} aria-hidden />
            </span>
          </Marker>
        )}

        {/* MARC Brunswick Line stations — the four county rail stops,
            distinct from the bus dots: larger, brick-accent squares with
            a label, so the rail network reads as its own layer. Static
            (always present), unlike the live-fetched bus stops. */}
        <Source
          id="marc-stations"
          type="geojson"
          data={{
            type: "FeatureCollection",
            features: MARC_STATIONS.map((s) => ({
              type: "Feature",
              properties: { name: s.name },
              geometry: { type: "Point", coordinates: [s.lng, s.lat] },
            })),
          }}
        >
          <Layer
            id="marc-stations-dots"
            type="circle"
            paint={{
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 12, 7],
              "circle-color": ACCENTS.terracotta,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            }}
          />
          <Layer
            id="marc-stations-labels"
            type="symbol"
            layout={{
              "text-field": ["concat", ["get", "name"], " MARC"],
              "text-font": MAPBOX_LABEL_FONT_MEDIUM,
              "text-size": 11,
              "text-offset": [0, 1.1],
              "text-anchor": "top",
              "text-optional": true,
            }}
            paint={{
              "text-color": ACCENTS.terracotta,
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.5,
            }}
          />
        </Source>

        {/* Real-time vehicle positions — route-colored badges that glide
            between polls. Self-hides when the feed reports zero. */}
        <LiveBuses
          show={liveBuses}
          highlightRouteId={route ?? undefined}
          focusVehicleId={vehicleFocus?.vehicleId}
          focusRequestId={vehicleFocus?.requestId}
          gate={liveGate}
        />

        {/* Live MARC trains ride the same live toggle as the buses, so the
            rail corridor moves too instead of sitting as static pins. */}
        <LiveMarcTrains show={liveBuses && showTrains} gate={liveGate} />

        {/* Stop-tap detail — name, routes here, and live inbound arrivals. */}
        {activeStop && stopPreviewOpen && (
          <Popup
            longitude={activeStop.lng}
            latitude={activeStop.lat}
            anchor="bottom"
            offset={14}
            closeOnClick={false}
            onClose={() => closeForeground(true)}
            maxWidth="250px"
          >
            <StopArrivalsPopup
              key={activeStop.id}
              stop={activeStop}
              onUseStop={(stop) => requestTransitStopFocus({ stopId: stop.id, selectForRider: true })}
            />
          </Popup>
        )}
      </Map>
      )}

      {/* Editorial badge — top-left. Tells the user what the painted
          lines represent without competing with the Mapbox attribution
          in the bottom corner. Count is route + stop when both are
          present, route-only when stops failed to load. */}
      {!mapFailed && !hideBadge && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--app-cool)" }}
          />
          TransIT Frederick · {shapeSourceLabel} · {shapes.features.length} route patterns
          {renderStops.length > 0 && ` · ${renderStops.length} stops`}
        </span>
      )}
      {vehicleFocus && (
        <span className="sr-only" role="status" aria-live="polite">
          Tracking bus {vehicleFocus.vehicleId}
          {vehicleFocus.stopName
            ? ` to ${vehicleFocus.stopName}`
            : " to the selected stop"}
          .
        </span>
      )}
      </div>
    </div>
  );
}
