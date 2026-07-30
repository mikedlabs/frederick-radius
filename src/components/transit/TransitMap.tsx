"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Source,
  Layer,
  AttributionControl,
  Popup,
  type MapMouseEvent,
  type MapRef,
} from "react-map-gl/mapbox";
import { FREDERICK_COUNTY_BBOX } from "@/lib/geo";
import { ACCENTS } from "@/data/categories";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { STYLE_URL } from "@/components/map/constants";
import { applyFrederickPalette } from "@/components/map/applyFrederickPalette";
import LiveBuses from "@/components/map/LiveBuses";
import LiveMarcTrains from "@/components/map/LiveMarcTrains";
import StopArrivalsPopup, { type SelectedStop } from "./StopArrivalsPopup";
import { haptic } from "@/lib/haptics";
import type { LineFC, TransitStop } from "@/lib/integrations/transitFrederick";
import {
  clearPendingTransitRouteFocus,
  clearPendingTransitVehicleFocus,
  isTransitVehicleFocusDetail,
  takePendingTransitRouteFocus,
  takePendingTransitVehicleFocus,
  TRANSIT_ROUTE_FOCUS_EVENT,
  TRANSIT_VEHICLE_FOCUS_EVENT,
  type TransitRouteFocusDetail,
  type TransitVehicleFocusDetail,
} from "@/lib/transit-focus";
import { MARC_STATIONS } from "@/data/marc-stations";
import TRANSIT from "@/data/transit.json";
import TRANSIT_NETWORK from "@/data/transit-network.json";
import { CURRENT_TRANSIT_STOPS } from "@/lib/transit-static";
import "mapbox-gl/dist/mapbox-gl.css";

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

type ActiveVehicleFocus = TransitVehicleFocusDetail & {
  requestId: number;
};

type TransitMapInstance = ReturnType<MapRef["getMap"]>;

function frameVehicleAndStop(
  map: TransitMapInstance,
  detail: TransitVehicleFocusDetail,
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
      padding: 54,
      maxZoom: 15,
      duration: reduced ? 0 : 500,
    },
  );
}

/**
 * The transit SERVICE AREA — the bounding box of every route polyline (the real
 * extent where buses actually run), padded slightly. Used to leash the live-bus
 * map so it can't be panned off into empty county where nothing moves. Shape
 * points are [lat, lng]; mapbox bounds are [[west,south],[east,north]].
 */
const SERVICE_BOUNDS: [[number, number], [number, number]] = (() => {
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
  if (!Number.isFinite(minLng)) return [[-77.50, 39.34], [-77.32, 39.50]];
  const padLng = (maxLng - minLng) * 0.06 || 0.02;
  const padLat = (maxLat - minLat) * 0.06 || 0.02;
  return [[minLng - padLng, minLat - padLat], [maxLng + padLng, maxLat + padLat]];
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
 *   - `applyFrederickPalette` is the same recolor hook every other
 *     map in the app runs through, so the base tiles feel
 *     identical across /map, /radius, /m/[slug], and now /transit.
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
    if (!map || !route || vehicleFocus) return;
    const routeLines = SHAPE_LINES_BY_ROUTE[route];
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
      { padding: 54, duration: reduced ? 0 : 500 },
    );
  }, [route, vehicleFocus]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !vehicleFocus) return;
    frameVehicleAndStop(map, vehicleFocus);
  }, [vehicleFocus]);

  // The compact route finder below the map uses the same route state instead
  // of acting like a second, disconnected catalog. Selecting a result focuses
  // the route here and lets the existing fitBounds effect frame it.
  useEffect(() => {
    const applyRoute = (routeId: string | null | undefined) => {
      if (!routeId || !ROUTES.some((item) => item.id === routeId)) return;
      clearPendingTransitRouteFocus();
      setVehicleFocus(null);
      setRoute(routeId);
    };
    const applyVehicle = (
      detail: TransitVehicleFocusDetail | null | undefined,
    ) => {
      if (!detail || !isTransitVehicleFocusDetail(detail)) return;
      clearPendingTransitVehicleFocus();
      clearPendingTransitRouteFocus();
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
    const focusRoute = (event: Event) => {
      applyRoute((event as CustomEvent<TransitRouteFocusDetail>).detail?.routeId);
    };
    const focusVehicle = (event: Event) => {
      applyVehicle(
        (event as CustomEvent<TransitVehicleFocusDetail>).detail,
      );
    };
    window.addEventListener(TRANSIT_ROUTE_FOCUS_EVENT, focusRoute);
    window.addEventListener(TRANSIT_VEHICLE_FOCUS_EVENT, focusVehicle);
    const pendingVehicle = takePendingTransitVehicleFocus();
    if (pendingVehicle) {
      applyVehicle(pendingVehicle);
    } else {
      applyRoute(takePendingTransitRouteFocus());
    }
    return () => {
      window.removeEventListener(TRANSIT_ROUTE_FOCUS_EVENT, focusRoute);
      window.removeEventListener(
        TRANSIT_VEHICLE_FOCUS_EVENT,
        focusVehicle,
      );
    };
  }, []);

  // Stop-tap detail (interactiveStops only): the tapped stop, resolved to its
  // arrivals in a Popup. Cleared by a tap on empty map or the Popup close.
  const [selectedStop, setSelectedStop] = useState<SelectedStop | null>(null);
  const [cursor, setCursor] = useState("");
  // Render the real GTFS stops when interactive (so a tap can resolve arrivals);
  // otherwise keep the decorative prop-driven dots the other callers pass.
  const renderStops = interactiveStops ? STOPS_JSON : stops;

  const onMapClick = (e: MapMouseEvent) => {
    const f = e.features?.find((ft) => ft.layer?.id === "transit-stops-hit");
    if (!f || f.geometry.type !== "Point") {
      setSelectedStop(null);
      return;
    }
    const props = (f.properties ?? {}) as { id?: string; name?: string };
    const [lng, lat] = f.geometry.coordinates as [number, number];
    if (props.id != null) {
      setSelectedStop({ id: String(props.id), name: String(props.name ?? "Bus stop"), lng, lat });
      haptic("light");
    } else {
      setSelectedStop(null);
    }
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

  return (
    <div className="space-y-2">
      {highlightRoutes && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            Choose a route to frame its path.
          </p>
          <label className="shrink-0">
            <span className="sr-only">Bus route</span>
            <select
              value={route ?? ""}
              onChange={(event) => {
                setVehicleFocus(null);
                setRoute(event.target.value || null);
              }}
              className="min-h-11 max-w-[13rem] rounded-full border bg-[var(--app-bg-elevated)] px-3 text-[13px] font-semibold"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
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
        className="relative overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{ borderColor: "var(--app-border)", height }}
      >
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={STYLE_URL}
        initialViewState={initial}
        style={{ width: "100%", height: "100%" }}
        // Drag + pinch on; cooperative gestures off so a single-finger
        // pan works without the "use two fingers" hint.
        interactive
        cooperativeGestures={false}
        attributionControl={false}
        maxBounds={lockToService ? SERVICE_BOUNDS : undefined}
        minZoom={lockToService ? 10.5 : undefined}
        interactiveLayerIds={interactiveStops ? ["transit-stops-hit"] : undefined}
        cursor={cursor}
        onMouseEnter={interactiveStops ? () => setCursor("pointer") : undefined}
        onMouseLeave={interactiveStops ? () => setCursor("") : undefined}
        onClick={interactiveStops ? onMapClick : undefined}
        onLoad={(e) => {
          applyFrederickPalette(e.target);
          // With an explicit center (e.g. /pulse → downtown Frederick) we open
          // THERE — the maxBounds leash still keeps the camera over the service
          // area, the user can zoom out for outlying buses. Without a center,
          // frame the whole service area so the map still lands where buses run
          // instead of the empty county.
          if (vehicleFocus) {
            frameVehicleAndStop(e.target, vehicleFocus);
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
              "line-width": 6,
              "line-opacity": 0.55,
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
              "line-width": 3,
              "line-opacity": 0.8,
            }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
          />
        </Source>

        {/* Route highlighter — the selected route's path, drawn bold in its
            own color (with a white halo) on top of the slate network. */}
        {selLine && selMeta && (
          <Source id="transit-route-highlight" type="geojson" data={selLine}>
            <Layer
              id="transit-route-highlight-halo"
              type="line"
              paint={{ "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.75, "line-blur": 0.4 }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
            <Layer
              id="transit-route-highlight-line"
              type="line"
              paint={{ "line-color": selMeta.color, "line-width": 5, "line-opacity": 0.95 }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
          </Source>
        )}

        {/* The rider's chosen stop stays visually distinct after a stop-to-bus
            handoff. This is a target, not a claim that the straight-line
            distance is the bus path; the official route variants remain the
            only painted path. */}
        {vehicleFocus && (
          <Source
            id="transit-rider-target"
            type="geojson"
            data={{
              type: "Feature",
              properties: {},
              geometry: {
                type: "Point",
                coordinates: [
                  vehicleFocus.stop.lng,
                  vehicleFocus.stop.lat,
                ],
              },
            }}
          >
            <Layer
              id="transit-rider-target-halo"
              type="circle"
              paint={{
                "circle-radius": 13,
                "circle-color": "#ffffff",
                "circle-opacity": 0.92,
                "circle-stroke-color": selMeta?.color ?? ACCENTS.slate,
                "circle-stroke-width": 3,
              }}
            />
            <Layer
              id="transit-rider-target-core"
              type="circle"
              paint={{
                "circle-radius": 4,
                "circle-color": selMeta?.color ?? ACCENTS.slate,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1,
              }}
            />
          </Source>
        )}

        {/* Stops — only rendered when the upstream feed returned a
            non-empty list. Drawn AFTER the route lines so the dots
            sit on top, with a thin white halo so they read on any
            tile background. Tiny radius + zoom-scaled so the network
            looks clean at county zoom and stops become readable when
            the user zooms into a single corridor. */}
        {renderStops.length > 0 && (
          <Source
            id="transit-stops"
            type="geojson"
            data={{
              type: "FeatureCollection",
              features: renderStops.map((s) => ({
                type: "Feature",
                properties: { name: s.name, id: s.id },
                geometry: { type: "Point", coordinates: [s.lng, s.lat] },
              })),
            }}
          >
            <Layer
              id="transit-stops-dots"
              type="circle"
              paint={{
                // Smaller at county zoom, larger zoomed in. Keeps the
                // network legible at both scales.
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  8, 2,
                  11, 3,
                  14, 5,
                ],
                "circle-color": ACCENTS.slate,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.2,
                "circle-opacity": 0.92,
              }}
            />
            {/* Invisible, zoom-scaled hit target so a small stop dot is easy to
                tap once the rider has zoomed into their corridor. Kept modest at
                county zoom so a tap there doesn't grab a far-off stop. */}
            {interactiveStops && (
              <Layer
                id="transit-stops-hit"
                type="circle"
                paint={{
                  "circle-radius": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    9, 7,
                    12, 12,
                    15, 18,
                  ],
                  "circle-color": ACCENTS.slate,
                  "circle-opacity": 0,
                }}
              />
            )}
          </Source>
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
        />

        {/* Live MARC trains ride the same live toggle as the buses, so the
            rail corridor moves too instead of sitting as static pins. */}
        <LiveMarcTrains show={liveBuses && showTrains} />

        {/* Stop-tap detail — name, routes here, and live inbound arrivals. */}
        {selectedStop && (
          <Popup
            longitude={selectedStop.lng}
            latitude={selectedStop.lat}
            anchor="bottom"
            offset={14}
            closeOnClick={false}
            onClose={() => setSelectedStop(null)}
            maxWidth="250px"
          >
            <StopArrivalsPopup key={selectedStop.id} stop={selectedStop} />
          </Popup>
        )}
      </Map>

      {/* Editorial badge — top-left. Tells the user what the painted
          lines represent without competing with the Mapbox attribution
          in the bottom corner. Count is route + stop when both are
          present, route-only when stops failed to load. */}
      {!hideBadge && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--app-cool)" }}
          />
          TransIT Frederick · {shapes.features.length} published route patterns
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
