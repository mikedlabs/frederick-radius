"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Map as MapIcon, ArrowUpRight, X, Layers as LayersIcon } from "lucide-react";
import MapOverlays from "@/components/map/MapOverlays";
import LiveBuses from "@/components/map/LiveBuses";
import { OVERLAYS, type OverlayKey } from "@/lib/overlays";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import type { TravelMode } from "@/lib/geo";
import { ACCENTS, CATEGORY_BY_SLUG } from "@/data/categories";
import { installCategoryMarkers } from "@/components/map/categoryMarkers";
import { applyFrederickPalette } from "@/components/map/applyFrederickPalette";
import { installCountySpotlight } from "@/components/map/countySpotlight";
import type { MapRef, MapMouseEvent, MarkerDragEvent } from "react-map-gl/mapbox";
// Mapbox CSS — without this, tile rendering and canvas sizing fail.
import "mapbox-gl/dist/mapbox-gl.css";

/**
 * RadiusMap — the big interactive county canvas for /radius.
 *
 * Big differences from the first cut:
 *  - Fills ~60vh so the page leads with the geography.
 *  - Interactive: pan, zoom, tap-to-set-center, drag the center pin.
 *  - Initial view fits Frederick County so "the whole county" is the
 *    starting frame. Two floating buttons let the user fit the radius
 *    tightly or jump back to the county view.
 *  - In-range places render as small dots on the map so the user can
 *    SEE how dense their reach is, not just read "518 places."
 *  - Stat bar lives in RadiusBuilder now — this component just owns
 *    the canvas + overlays.
 */

const Map = dynamic(() => import("react-map-gl/mapbox").then((m) => m.default), {
  ssr: false,
  loading: () => null,
});
const Source = dynamic(() => import("react-map-gl/mapbox").then((m) => m.Source), { ssr: false });
const Layer = dynamic(() => import("react-map-gl/mapbox").then((m) => m.Layer), { ssr: false });
const Marker = dynamic(() => import("react-map-gl/mapbox").then((m) => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-map-gl/mapbox").then((m) => m.Popup), { ssr: false });

const STYLE_URL = "mapbox://styles/mapbox/light-v11";

// Frederick County bbox in the [W, S, E, N] form Mapbox wants for
// fitBounds. Source: src/lib/integrations/overpass.ts (kept in sync).
const COUNTY_BOUNDS: [[number, number], [number, number]] = [
  [-77.700, 39.265],
  [-77.150, 39.745],
];

const MODE_HEX: Partial<Record<TravelMode, string>> = {
  walk: ACCENTS.slate,
  bike: "#3B7A52",
  drive: ACCENTS.terracotta,
};

/** 72-step polygon approximating a circle of `meters` around `center`. */
function circlePolygon(
  center: { lng: number; lat: number },
  meters: number,
  steps = 72,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: [number, number][] = [];
  const latR = meters / 111320;
  const lngR = meters / (111320 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([center.lng + lngR * Math.cos(a), center.lat + latR * Math.sin(a)]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

/** Bounds for the radius circle padded ~25% so it sits inside the
 *  viewport with breathing room when the user taps "Fit radius." */
function radiusBounds(
  center: { lng: number; lat: number },
  meters: number,
): [[number, number], [number, number]] {
  const pad = meters * 1.25;
  const latR = pad / 111320;
  const lngR = pad / (111320 * Math.cos((center.lat * Math.PI) / 180));
  return [
    [center.lng - lngR, center.lat - latR],
    [center.lng + lngR, center.lat + latR],
  ];
}

/**
 * One county place rendered on the map. Carries the minimum metadata
 * needed to draw a category-iconed marker and surface a tap preview
 * (slug + name); no photo URL, no full place record, so the props stay
 * light even at the full county set (~1,700 places).
 *
 * The radius is a LENS, not a fence: the map plots every county place,
 * and `inReach` decides emphasis — in-reach places draw bright and
 * labeled, the rest stay visible but quiet so discovery is never clipped
 * to the ring.
 */
export type InsideDot = {
  lng: number;
  lat: number;
  slug: string;
  name: string;
  category: string;
  /** Category color (CATEGORY_BY_SLUG[cat]?.color). Falls back to a
   *  neutral grey when the category isn't in the taxonomy. */
  category_color?: string;
  /** Within the active reach (isochrone/circle)? Drives the bright vs.
   *  quiet emphasis and whether a label is offered. Defaults to true so
   *  a caller that doesn't compute reach still gets full-strength pins. */
  inReach?: boolean;
  /** Feature score — orders collision priority so the strongest places
   *  win labels/placement when pins crowd. Higher = more prominent. */
  score?: number;
};

/** An in-reach event, plotted as a distinct ring marker (vs the solid
 *  category dots for places) so the map reads "places + happenings" at a
 *  glance. Minimal fields: enough to plot and to link the tap popup. */
export type EventDot = {
  lng: number;
  lat: number;
  slug: string;
  title: string;
};

export default function RadiusMap({
  mode,
  meters,
  center,
  centerLabel,
  places,
  events = [],
  reachable,
  onCenterChange,
  onSelectPlace,
  // Tuned so the map AND the control card below it (mode toggle +
  // slider) fit in one mobile viewport. The previous 60vh buried the
  // slider below the fold, which broke the "see what you're doing
  // while adjusting" loop.
  height = "min(54vh, 470px)",
}: {
  mode: TravelMode;
  meters: number;
  center: { lng: number; lat: number };
  centerLabel: string;
  /** The WHOLE county place set. Every place is plotted as a
   *  category-iconed marker; each one's `inReach` flag drives bright
   *  (in-reach) vs. quiet (beyond-reach) emphasis. The radius highlights;
   *  it never hides — so the county is always there to discover. */
  places: InsideDot[];
  /** Upcoming events inside the same reach, plotted as distinct ring
   *  markers. Tapping one opens a preview that links to the event. */
  events?: EventDot[];
  /** Mapbox Isochrone polygon for the "real reachable" area. When
   *  present, replaces the circle so the user sees what they can
   *  ACTUALLY reach by walking/biking/driving on real streets.
   *  Null while loading or on upstream failure → circle stays as
   *  the visible fallback. */
  reachable?: GeoJSON.FeatureCollection | null;
  /** Fires on map tap and on center-pin drag end. Parent can opt out
   *  (omit the prop) to keep the map view-only. */
  onCenterChange?: (next: { lng: number; lat: number }) => void;
  /** Tapping a PLACE marker calls this with its slug; the parent (which
   *  holds the full client place set) opens the PlaceSheet. When omitted,
   *  places fall back to the lightweight inline popup. */
  onSelectPlace?: (slug: string) => void;
  height?: string;
}) {
  const accentHex = MODE_HEX[mode] ?? ACCENTS.slate;
  const mapRef = useRef<MapRef | null>(null);
  // Map layers in the DEFAULT (Nearby) map — the GIS overlays were only
  // reachable in Whole-county mode before, so the field-guide layers
  // (parks, markets, public art, historic, covered bridges) never met
  // the user who never switched modes. Local state + a compact control;
  // MapOverlays handles its own lazy fetch, render, and popups.
  const [activeOverlays, setActiveOverlays] = useState<OverlayKey[]>([]);
  const [layersOpen, setLayersOpen] = useState(false);
  // Live TransIT buses: ON by default in the default (radius) view so the
  // map opens alive with real moving buses. Toggleable in the layers menu;
  // honest-empty (nothing) when no buses are running.
  const [showBuses, setShowBuses] = useState(true);
  const readyOverlays = OVERLAYS.filter((o) => o.ready);
  // Live position while dragging the center pin — gives the radius
  // circle a smooth follow without thrashing parent state on every
  // pointermove. Committed back via onCenterChange on dragend.
  const [drag, setDrag] = useState<{ lng: number; lat: number } | null>(null);
  // Runtime map failure (WebGL off, low-power mode, blocked tiles, old
  // device). Mapbox throws on init in these cases; without catching it
  // the map goes blank while the page still says "N places in radius."
  const [mapFailed, setMapFailed] = useState(false);
  // The place a user tapped on the map — shows the preview popup. Null
  // when no place is selected (the default).
  const [selected, setSelected] = useState<{
    lng: number;
    lat: number;
    slug: string;
    name: string;
    color: string;
    /** Drives the popup's link target + label: places go to /places,
     *  events to /events. Defaults to place when omitted. */
    kind?: "place" | "event";
  } | null>(null);

  // Hover preview (desktop): the dot under the cursor. Updated only when
  // the hovered feature CHANGES, never on every pixel, so the popup does
  // not thrash render. hoveredId tracks the Mapbox feature-state target.
  const [hover, setHover] = useState<{
    lng: number;
    lat: number;
    name: string;
    category: string;
  } | null>(null);
  const hoveredId = useRef<number | string | null>(null);

  // Pin-drag throttle: coalesce pointermove events into one state flush
  // per animation frame so dragging the center pin stays smooth instead
  // of recomputing the radius polygon on every raw pointermove.
  const latestDrag = useRef<{ lng: number; lat: number } | null>(null);
  const dragRaf = useRef<number | null>(null);

  const effectiveCenter = drag ?? center;

  const circle = useMemo(
    () => circlePolygon(effectiveCenter, meters),
    [effectiveCenter, meters],
  );

  // Single, stable source for the reachable area. The DATA flips
  // between the real Mapbox isochrone (when loaded) and the circle
  // fallback (mid-fetch / on upstream failure), but the source ID
  // stays the same — Mapbox throws "source id changed" if you swap
  // <Source id=...> between renders, since it ties WebGL state to
  // the id. Same Source + swapped FeatureCollection = no error.
  const usingIsochrone = Boolean(reachable && reachable.features.length > 0);
  const reachData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (usingIsochrone && reachable) return reachable;
    return { type: "FeatureCollection", features: [circle] };
  }, [usingIsochrone, reachable, circle]);

  // The reach veil — everything BEYOND the reach recedes under a gentle
  // paper wash (a generous box minus the reach rings as holes; the same
  // construction as the county spotlight, much softer). This is what
  // makes the radius read as the hero of its own map: inside is vivid,
  // outside stays visible but quiet, and the boundary needs no extra
  // ink to be unmistakable.
  const reachVeil = useMemo<GeoJSON.FeatureCollection>(() => {
    const holes: GeoJSON.Position[][] = [];
    for (const f of reachData.features) {
      const g = f.geometry;
      if (g.type === "Polygon" && g.coordinates[0]) holes.push(g.coordinates[0]);
      else if (g.type === "MultiPolygon") {
        for (const poly of g.coordinates) if (poly[0]) holes.push(poly[0]);
      }
    }
    if (holes.length === 0) return { type: "FeatureCollection", features: [] };
    const box: GeoJSON.Position[] = [
      [-80.5, 37.5],
      [-74.5, 37.5],
      [-74.5, 41.5],
      [-80.5, 41.5],
      [-80.5, 37.5],
    ];
    return {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [box, ...holes] } },
      ],
    };
  }, [reachData]);

  const placesGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: places.map((p) => {
        const inReach = p.inReach !== false;
        return {
          type: "Feature",
          properties: {
            slug: p.slug,
            name: p.name,
            // Category slug rides along so the icon-image expression can
            // resolve `cat-<category>` and the tap popup can show a human
            // label via CATEGORY_BY_SLUG.
            category: p.category,
            // Falls back to a neutral grey for places that don't have a
            // category color, so a missing taxonomy entry never breaks
            // the whole layer.
            color: p.category_color ?? "#7A828C",
            // 1 = within reach (bright + labeled), 0 = beyond (quiet).
            inReach: inReach ? 1 : 0,
            // Collision priority: LOWER places/labels first (wins). In-
            // reach always outranks beyond-reach; within each tier the
            // higher feature_score wins. So the strongest, closest places
            // keep their labels when the map crowds.
            pri: (inReach ? 0 : 100_000) - (p.score ?? 0),
          },
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        };
      }),
    };
  }, [places]);

  const eventsGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: events.map((e) => ({
        type: "Feature",
        properties: { slug: e.slug, name: e.title, kind: "event" },
        geometry: { type: "Point", coordinates: [e.lng, e.lat] },
      })),
    };
  }, [events]);

  // Cancel any pending drag-flush frame on unmount so it never fires
  // setDrag after the component is gone.
  useEffect(() => {
    return () => {
      if (dragRaf.current != null) cancelAnimationFrame(dragRaf.current);
    };
  }, []);

  // When the parent's center changes (preset dropdown, Locate, tap),
  // glide the camera to the new spot without changing zoom. The user's
  // chosen zoom level is preserved. easeTo with a calm cubic.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.easeTo({
      center: [center.lng, center.lat],
      duration: 480,
      easing: (t) => t * (2 - t),
    });
  }, [center.lng, center.lat]);

  const fitToRadius = () => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.fitBounds(radiusBounds(effectiveCenter, meters), {
      padding: 48,
      duration: 540,
      easing: (t) => t * (2 - t),
    });
  };

  const fitToCounty = () => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.fitBounds(COUNTY_BOUNDS, {
      padding: 32,
      duration: 600,
      easing: (t) => t * (2 - t),
    });
  };

  // Single-tap on the map. The brief's "place is verified, not guessed"
  // rule applies here too — if the tap lands on a known place dot, we
  // show its preview popup; otherwise we treat the tap as a request to
  // move the center.
  //
  // react-map-gl's onClick gives us a `features` array when the layer
  // is listed in interactiveLayerIds. Falling back to
  // queryRenderedFeatures handles the case where features is undefined
  // (older versions, edge cases) so the popup is always reachable.
  const handleMapClick = (e: MapMouseEvent) => {
    const hits =
      (e.features && e.features.length > 0
        ? e.features
        : e.target.queryRenderedFeatures(e.point, {
            layers: ["radius-places-hit", "radius-places-dots", "radius-events-dots"],
          })) ?? [];
    if (hits.length > 0) {
      const f = hits[0];
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const props = (f.properties ?? {}) as {
        slug?: string;
        name?: string;
        color?: string;
        kind?: string;
      };
      const isEvent = f.layer?.id === "radius-events-dots" || props.kind === "event";
      if (props.slug && props.name) {
        // PLACES open the full PlaceSheet bottom sheet (the same premium
        // surface the browse map uses) when the parent wires it — the
        // tiny inline popup was the last vestige of the old radius map.
        // Events keep the lightweight popup (no event sheet exists).
        if (!isEvent && onSelectPlace) {
          onSelectPlace(props.slug);
          setSelected(null);
          return;
        }
        setSelected({
          lng: coords[0],
          lat: coords[1],
          slug: props.slug,
          name: props.name,
          // Events ride a fixed brand tint (their ring marker isn't
          // category-colored); places keep their category color.
          color: isEvent ? "#A03A22" : props.color ?? "#7A828C",
          kind: isEvent ? "event" : "place",
        });
        return;
      }
    }
    if (!onCenterChange) return;
    setSelected(null);
    onCenterChange({ lng: e.lngLat.lng, lat: e.lngLat.lat });
  };

  // Hover preview. Fires on every mouse move over the map, but only does
  // work when the dot under the cursor CHANGES: it flips the old dot's
  // feature-state off, the new dot's on (drives the size bump), and
  // anchors the popup to the new dot. Moving within one dot is a no-op.
  const handleMouseMove = (e: MapMouseEvent) => {
    const map = e.target;
    // Only places get the hover size-bump + popup. Event ring markers
    // are click-only, so we ignore them here (their feature-state lives
    // on a different source anyway).
    const f = e.features?.find((ff) => ff.layer?.id === "radius-places-dots") ?? null;
    const id = f && (f.properties as { slug?: string })?.slug ? f.id ?? null : null;
    if (id === hoveredId.current) return;
    if (hoveredId.current != null) {
      map.setFeatureState({ source: "radius-places", id: hoveredId.current }, { hover: false });
    }
    hoveredId.current = id;
    if (id != null && f) {
      map.setFeatureState({ source: "radius-places", id }, { hover: true });
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const props = (f.properties ?? {}) as { name?: string; category?: string };
      setHover({
        lng: coords[0],
        lat: coords[1],
        name: props.name ?? "",
        category: props.category ?? "",
      });
    } else {
      setHover(null);
    }
  };

  const handleMouseLeave = (e: MapMouseEvent) => {
    const map = e.target;
    if (hoveredId.current != null) {
      map.setFeatureState({ source: "radius-places", id: hoveredId.current }, { hover: false });
      hoveredId.current = null;
    }
    setHover(null);
  };

  // Live-update the pin position as the user drags, throttled to one
  // state flush per animation frame so the radius polygon recompute does
  // not run on every raw pointermove. Commit to the parent on dragend.
  const onPinDrag = (e: MarkerDragEvent) => {
    latestDrag.current = { lng: e.lngLat.lng, lat: e.lngLat.lat };
    if (dragRaf.current != null) return;
    dragRaf.current = requestAnimationFrame(() => {
      dragRaf.current = null;
      if (latestDrag.current) setDrag(latestDrag.current);
    });
  };
  const onPinDragEnd = (e: MarkerDragEvent) => {
    if (dragRaf.current != null) {
      cancelAnimationFrame(dragRaf.current);
      dragRaf.current = null;
    }
    latestDrag.current = null;
    setDrag(null);
    if (onCenterChange) {
      onCenterChange({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    }
  };

  // Branded fallback for no-token AND runtime WebGL/tile failure. Audit:
  // "Map did not load. Nearby places still work." + a retry, instead of
  // a blank box. The reach controls + within-reach list below keep working.
  if (!MAPBOX_TOKEN || mapFailed) {
    return (
      <div
        className="relative grid place-items-center overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-sunken)] px-6 text-center"
        style={{ borderColor: "var(--app-border)", height }}
      >
        <div>
          <MapIcon className="mx-auto h-7 w-7" style={{ color: "var(--app-cool)" }} strokeWidth={1.5} aria-hidden />
          <p className="mt-2 text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
            Map didn&rsquo;t load
          </p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            Nearby places still work. The controls and list below are all here.
          </p>
          {mapFailed && (
            <button
              type="button"
              onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}
              className="tactile tactile-interactive mt-3 inline-flex items-center rounded-full px-4 py-1.5 text-[12px] font-semibold"
              style={{ background: "var(--app-bg-elevated)", color: "var(--app-cool)" }}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Radius map"
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border shadow-[var(--app-shadow-1)]"
      style={{ borderColor: "var(--app-border)", height }}
    >
      <Map
        ref={(r) => {
          mapRef.current = r as unknown as MapRef | null;
        }}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={STYLE_URL}
        // Catch fatal init failure (WebGL off, blocked context) → branded
        // fallback instead of a blank box. Transient tile errors are
        // ignored so they don't nuke a working map.
        onError={(e) => {
          const msg = String(e?.error?.message ?? "").toLowerCase();
          if (msg.includes("webgl") || msg.includes("failed to initialize") || msg.includes("context")) {
            setMapFailed(true);
          }
        }}
        // Initial frame: center on the active preset (Frederick downtown
        // by default) at neighborhood zoom. The previous fit-to-county
        // opened the map at ~zoom 9, which made every radius circle
        // look like a tiny dot in the middle of empty pasture. Starting
        // at zoom 13 puts downtown on screen at human scale so the
        // 10-min-walk default is immediately legible. The user can
        // still tap "Show county" (the camera button in the top-right)
        // for the wider view; the easeTo effect below glides the camera
        // when the user picks a different preset.
        initialViewState={{
          longitude: center.lng,
          latitude: center.lat,
          zoom: 13,
          // Gentle tilt so the 3D relief reads as dimensional depth
          // without distorting the reach circle into an unreadable
          // ellipse — enough to feel the ridges, not a flight-sim angle.
          pitch: 32,
        }}
        maxPitch={70}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        // Mapbox's logo and attribution must remain visible on every map that
        // uses its styles or tiles. Keep the compact default control enabled.
        attributionControl
        onClick={handleMapClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        // Install the shared category-icon images (the same colored pucks
        // the browse map uses) so the radius view reads as a story at a
        // glance — food orange, parks green, arts purple — instead of
        // anonymous dots. styleimagemissing inside the installer covers
        // any category not eagerly added, and survives style reloads.
        onLoad={(e) => {
          installCategoryMarkers(e.target);
          // Repaint stock light-v11 into the Frederick brand: paper-cream
          // land, Carroll Creek slate water, sage parks, warm-ink labels,
          // Catoctin/South Mountain hillshade — and POI clutter hidden so
          // OUR pins are the only points of interest ("nothing else
          // there"). The browse map already does this; the default radius
          // view now matches, so the premium look is consistent.
          applyFrederickPalette(e.target);
          // Lock the plate into Frederick County: veil everything beyond
          // the line in warm paper + trace the border, so the map reads
          // as a field-guide page of ONE place, not a window onto an
          // endless world. Eases back as you zoom into a neighborhood.
          installCountySpotlight(e.target);
          // 3D relief — "Frederick IS its terrain." applyFrederickPalette
          // already loads the fr-dem elevation source; draping the map
          // over it (with the gentle default pitch below) makes the
          // Catoctin & South Mountain ridges physically rise. Low
          // exaggeration so the reach circle stays legibly round and the
          // map stays a usable wayfinding tool, not a flight sim.
          try {
            e.target.setTerrain({ source: "fr-dem", exaggeration: 1.15 });
          } catch {
            /* DEM unavailable on this token — stays flat, no harm */
          }
        }}
        // The invisible hit-pad is listed FIRST so a fingertip near a tiny
        // icon still resolves to the place (Fitts-friendly tap target).
        interactiveLayerIds={["radius-places-hit", "radius-places-dots", "radius-events-dots"]}
        // Pointer over a dot, otherwise the move-center crosshair (or a
        // plain grab when the map is view-only).
        cursor={hover ? "pointer" : onCenterChange ? "crosshair" : "grab"}
        style={{ width: "100%", height: "100%" }}
      >
        {/* THE WHOLE COUNTY as category-iconed markers — the map reads as
            a story at a glance: food orange, parks green, arts purple.
            The radius is a LENS, not a fence — every place is plotted; the
            `inReach` flag only decides emphasis. In-reach places draw at
            full size + color and earn a label; beyond-reach places stay
            visible but quiet (smaller, faded) so discovery is never
            clipped to the ring. generateId gives stable numeric feature
            ids for the hover preview's feature-state. */}
        <Source id="radius-places" type="geojson" data={placesGeoJson} generateId>
          {/* Icons. icon-allow-overlap mirrors the browse map: the
              label-heavy light base style would otherwise make our pins
              lose collisions and the map would read empty. Beyond-reach
              pins are smaller AND faded so the eye lands on what's close
              first, without losing the sense of the wider county. */}
          <Layer
            id="radius-places-dots"
            type="symbol"
            layout={{
              "icon-image": [
                "coalesce",
                ["image", ["concat", "cat-", ["get", "category"]]],
                ["image", "cat-_default"],
              ],
              "icon-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, ["case", ["==", ["get", "inReach"], 1], 0.46, 0.26],
                13, ["case", ["==", ["get", "inReach"], 1], 0.68, 0.34],
                15, ["case", ["==", ["get", "inReach"], 1], 0.86, 0.46],
                17, ["case", ["==", ["get", "inReach"], 1], 1.0, 0.6],
              ],
              // Radar declutter: collision-thin overlapping pins instead
              // of forcing every one on screen (the old true/true made
              // downtown an unreadable blob of hundreds of markers).
              // symbol-sort-key = pri keeps the strongest, in-reach,
              // highest-score pins; the rest yield. Same collision the
              // labels layer already uses, so density reads as a calm
              // radar of the best nearby spots, not a wall of icons.
              "icon-allow-overlap": false,
              "icon-ignore-placement": false,
              "symbol-sort-key": ["get", "pri"],
              "icon-anchor": "center",
              // More breathing room between pins → a calmer radar.
              "icon-padding": 7,
            }}
            paint={{
              // Beyond-reach pins fade further back so the in-reach set
              // clearly leads the eye — present, not shouting.
              "icon-opacity": ["case", ["==", ["get", "inReach"], 1], 1, 0.42],
            }}
          />
          {/* Invisible Fitts-friendly tap pad — keeps a ~36px touch target
              even when an icon shrinks at low zoom. Same source, so the
              click handler resolves back to the place via props.slug. */}
          <Layer
            id="radius-places-hit"
            type="circle"
            paint={{
              "circle-color": "#000000",
              "circle-opacity": 0,
              "circle-radius": 16,
            }}
          />
          {/* Names for what's CLOSE. Labels are offered only for in-reach
              places (clutter control) and appear from the default radius
              zoom, so the user can READ the nearby answers — not just see
              dots. Collision (text-allow-overlap false) auto-thins them;
              symbol-sort-key keeps the strongest, closest names. */}
          <Layer
            id="radius-places-labels"
            type="symbol"
            filter={["==", ["get", "inReach"], 1]}
            minzoom={12}
            layout={{
              "text-field": ["get", "name"],
              "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10.5, 17, 13],
              "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
              "text-anchor": "top",
              "text-offset": [0, 1.0],
              "text-optional": true,
              "text-allow-overlap": false,
              "text-max-width": 8,
              "symbol-sort-key": ["get", "pri"],
            }}
            paint={{
              "text-color": "#1A1A1A",
              "text-halo-color": "#FAFAF7",
              "text-halo-width": 1.7,
              "text-opacity": ["interpolate", ["linear"], ["zoom"], 11.8, 0, 12.6, 1],
            }}
          />
        </Source>
        {/* The reachable area.
         *
         *  One Source with a stable id ("radius-reach") — see the
         *  `reachData` comment above for why. The DATA is the real
         *  isochrone polygon when loaded, the circle fallback
         *  otherwise. Layer paint props vary by `usingIsochrone` so
         *  the user can SEE when the truth has arrived: brighter
         *  fill + crisper line for the isochrone, quiet fade for the
         *  circle fallback. Same accent color throughout — only the
         *  shape and contrast change. */}
        {/* Veil beyond the reach — mounted before the reach source so
            the ring draws over the veil's inner edge. Dims everything
            outside (beyond-reach pins included, which is the point:
            they stay discoverable, just quiet). Eases back on zoom-in
            so a street-level view isn't washed out. */}
        <Source id="radius-reach-veil" type="geojson" data={reachVeil}>
          <Layer
            id="radius-reach-veil-fill"
            type="fill"
            paint={{
              "fill-color": "#EAE2D2",
              "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.34, 13, 0.26, 15.5, 0.12],
              "fill-opacity-transition": { duration: 420, delay: 0 },
            }}
          />
        </Source>
        <Source id="radius-reach" type="geojson" data={reachData}>
          <Layer
            id="radius-reach-fill"
            type="fill"
            paint={{
              "fill-color": accentHex,
              "fill-opacity": usingIsochrone ? 0.14 : 0.1,
              // Cross-fade the fill when the reach changes (mode flip,
              // slider, isochrone arriving) instead of snapping — the
              // reach reads as redrawn, not replaced. Slightly LIGHTER
              // than before: the veil now carries the inside/outside
              // contrast, so the fill can stop tinting the pins.
              "fill-opacity-transition": { duration: 420, delay: 0 },
            }}
          />
          {/* Soft outer glow — a wide, blurred pass of the same accent
              UNDER the crisp edge, so the boundary feels drawn with a
              brush, not stamped. */}
          <Layer
            id="radius-reach-glow"
            type="line"
            paint={{
              "line-color": accentHex,
              "line-width": usingIsochrone ? 13 : 11,
              "line-blur": 7,
              "line-opacity": 0.4,
              "line-opacity-transition": { duration: 420, delay: 0 },
              "line-width-transition": { duration: 420, delay: 0 },
            }}
          />
          <Layer
            id="radius-reach-line"
            type="line"
            paint={{
              "line-color": accentHex,
              "line-width": usingIsochrone ? 3 : 2.5,
              "line-opacity": usingIsochrone ? 1 : 0.9,
              "line-opacity-transition": { duration: 420, delay: 0 },
              "line-width-transition": { duration: 420, delay: 0 },
            }}
          />
        </Source>
        {/* In-reach events as distinct hollow ring markers — a white
            core with a brand ring, so they read as a different thing
            from the solid category place dots ("ring = happening,
            solid = place"). Mounted last so they sit above the places
            and the reach fill; a tap opens a preview linking to the
            event. */}
        <Source id="radius-events" type="geojson" data={eventsGeoJson}>
          <Layer
            id="radius-events-dots"
            type="circle"
            paint={{
              "circle-radius": 6,
              "circle-color": "#ffffff",
              "circle-opacity": 0.95,
              "circle-stroke-color": "#A03A22",
              "circle-stroke-width": 2.5,
            }}
          />
        </Source>
        {/* Draggable center pin. The visual is rendered inside the
            Marker; Marker handles the pointer events. */}
        <Marker
          longitude={effectiveCenter.lng}
          latitude={effectiveCenter.lat}
          anchor="center"
          draggable={Boolean(onCenterChange)}
          onDrag={onPinDrag}
          onDragEnd={onPinDragEnd}
        >
          <span
            aria-hidden
            style={{
              position: "relative",
              display: "grid",
              placeItems: "center",
              width: 28,
              height: 28,
              cursor: onCenterChange ? "grab" : "default",
            }}
          >
            {/* Living "Radius" — two ripple rings expand outward from the
                center on a staggered loop, so the center point feels
                ALIVE (the brand concept as motion). Pure transform/opacity,
                reduced-motion-safe via the .radius-ripple class. */}
            <span
              className="radius-ripple"
              style={{
                position: "absolute",
                width: 28,
                height: 28,
                borderRadius: 9999,
                border: `2.5px solid ${accentHex}`,
              }}
            />
            <span
              className="radius-ripple"
              style={{
                position: "absolute",
                width: 28,
                height: 28,
                borderRadius: 9999,
                border: `2.5px solid ${accentHex}`,
                animationDelay: "1400ms",
              }}
            />
            {/* Breathing core dot — bigger, with a thicker white ring and a
                deeper drop so "you are here" reads instantly over any tile. */}
            <span
              className="radius-breathe"
              style={{
                position: "relative",
                width: 26,
                height: 26,
                borderRadius: 9999,
                background: accentHex,
                border: "4px solid #fff",
                boxShadow: "0 7px 20px rgba(0,0,0,0.4)",
              }}
            />
          </span>
        </Marker>
        {/* Place preview popup — shows when a user taps a colored dot.
            Mobile-friendly dismiss: closeOnClick lets a tap on the map
            close the popup, and our own 32px close button gives a
            reliable tap target (Mapbox's default × is ~12px and easy
            to miss with a fingertip). */}
        {/* Hover preview (desktop) — a quiet name + category label on the
            dot under the cursor. Suppressed while a tap popup is open so
            the two never stack. Non-interactive so it never eats the
            click that opens the full preview. */}
        {hover && !selected && (
          <Popup
            longitude={hover.lng}
            latitude={hover.lat}
            anchor="bottom"
            offset={12}
            closeButton={false}
            closeOnClick={false}
            className="radius-hover-popup"
          >
            <div style={{ padding: "1px 2px", pointerEvents: "none" }}>
              <strong
                style={{
                  fontSize: 12.5,
                  color: "var(--app-ink, #1A1A1A)",
                  fontFamily: "var(--font-display), ui-serif, Georgia, serif",
                }}
              >
                {hover.name}
              </strong>
              {CATEGORY_BY_SLUG[hover.category]?.name && (
                <span
                  style={{
                    display: "block",
                    fontSize: 10.5,
                    color: "#7A7975",
                    marginTop: 1,
                  }}
                >
                  {CATEGORY_BY_SLUG[hover.category]?.name}
                </span>
              )}
            </div>
          </Popup>
        )}
        {selected && (
          <Popup
            longitude={selected.lng}
            latitude={selected.lat}
            anchor="bottom"
            offset={10}
            closeOnClick
            closeButton={false}
            onClose={() => setSelected(null)}
            maxWidth="280px"
          >
            <div style={{ minWidth: 200, padding: "2px 28px 2px 2px", position: "relative" }}>
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  setSelected(null);
                }}
                aria-label="Close"
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 32,
                  height: 32,
                  display: "grid",
                  placeItems: "center",
                  background: "transparent",
                  border: "none",
                  borderRadius: 9999,
                  cursor: "pointer",
                  color: "#7A7975",
                  WebkitTapHighlightColor: "rgba(0,0,0,0.06)",
                }}
              >
                <X size={16} strokeWidth={2.25} />
              </button>
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 9999,
                  background: selected.color,
                  marginRight: 6,
                  verticalAlign: "middle",
                }}
              />
              <strong
                style={{
                  fontSize: 13,
                  color: "var(--app-ink, #1A1A1A)",
                  fontFamily: "var(--font-display), ui-serif, Georgia, serif",
                  verticalAlign: "middle",
                }}
              >
                {selected.name}
              </strong>
              <div style={{ marginTop: 6 }}>
                <Link
                  href={
                    selected.kind === "event"
                      ? `/events/${selected.slug}`
                      : `/places/${selected.slug}`
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 700,
                    color: selected.color,
                  }}
                >
                  {selected.kind === "event" ? "See event" : "See place"}
                  <ArrowUpRight size={12} strokeWidth={2.25} />
                </Link>
              </div>
            </div>
          </Popup>
        )}
        {/* GIS overlays — same self-contained renderer the browse map
            uses, now in the default Nearby map too. */}
        <MapOverlays active={activeOverlays} />
        <LiveBuses show={showBuses} />
      </Map>

      {/* Center label pill — names the current center without making
          the user look at the dropdown below. Sits lower on mobile
          (top-11) so it clears the Mapbox logo, which globals.css pins to
          the top-left below lg (the bottom corners are under the sheet);
          back to the snug top-3 at lg+ where the logo returns to bottom. */}
      <div className="pointer-events-none absolute inset-x-0 top-11 z-[var(--z-map-control)] flex justify-center px-4 lg:top-3">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{
            background: "color-mix(in srgb, var(--app-bg-elevated) 92%, transparent)",
            color: "var(--app-ink-2)",
            backdropFilter: "blur(6px)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          {centerLabel}
        </span>
      </div>

      {/* Hint for the tap interaction — quiet, only visible when an
          onCenterChange handler is provided (i.e. user can move pins). */}
      {onCenterChange && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[var(--z-map-control)]">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: "color-mix(in srgb, var(--app-bg-elevated) 92%, transparent)",
              color: "var(--app-ink-3)",
              backdropFilter: "blur(6px)",
            }}
          >
            Tap or drag to move pin
          </span>
        </div>
      )}

      {/* Camera controls — Fit radius / Show county. Right side so they
          don't sit over the Mapbox attribution at the bottom-left. */}
      <div className="absolute right-3 top-3 z-[var(--z-map-control)] flex flex-col gap-1.5">
        <button
          type="button"
          onClick={fitToRadius}
          aria-label="Fit radius"
          title="Fit radius"
          className="tap-44 grid h-9 w-9 place-items-center rounded-full border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)] transition active:scale-[0.94]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          <Crosshair className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={fitToCounty}
          aria-label="Show whole county"
          title="Show whole county"
          className="tap-44 grid h-9 w-9 place-items-center rounded-full border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)] transition active:scale-[0.94]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          <MapIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        {/* Layers — opens a compact list of the ready field-guide
            overlays. Dark by default; the reader pulls one in. */}
        <button
          type="button"
          onClick={() => setLayersOpen((v) => !v)}
          aria-label="Map layers"
          aria-expanded={layersOpen}
          title="Map layers"
          className="tap-44 grid h-9 w-9 place-items-center rounded-full border shadow-[var(--app-shadow-1)] transition active:scale-[0.94]"
          style={{
            background: activeOverlays.length > 0 ? "var(--app-brand)" : "var(--app-bg-elevated)",
            borderColor: activeOverlays.length > 0 ? "var(--app-brand)" : "var(--app-border)",
            color: activeOverlays.length > 0 ? "#fff" : "var(--app-ink-2)",
          }}
        >
          <LayersIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        {layersOpen && (
          <div
            className="flex flex-col gap-1 rounded-[var(--app-radius-md)] border p-1.5 shadow-[var(--app-shadow-2)]"
            style={{ background: "color-mix(in srgb, var(--app-bg-elevated) 94%, transparent)", borderColor: "var(--app-border)", backdropFilter: "blur(8px)" }}
          >
            {/* Live buses — a real-time layer (not a static overlay), so
                its own toggle. Cool-tinted to match the transit identity. */}
            <button
              type="button"
              onClick={() => setShowBuses((v) => !v)}
              aria-pressed={showBuses}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition active:scale-[0.96]"
              style={{ background: showBuses ? "var(--app-cool)" : "transparent", color: showBuses ? "#fff" : "var(--app-ink-2)" }}
            >
              <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: showBuses ? "#fff" : "var(--app-cool)" }} />
              Live buses
            </button>
            {readyOverlays.map((o) => {
              const on = activeOverlays.includes(o.key);
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() =>
                    setActiveOverlays((cur) =>
                      cur.includes(o.key) ? cur.filter((k) => k !== o.key) : [...cur, o.key],
                    )
                  }
                  aria-pressed={on}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition active:scale-[0.96]"
                  style={{
                    background: on ? "var(--app-brand)" : "transparent",
                    color: on ? "#fff" : "var(--app-ink-2)",
                  }}
                >
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: on ? "#fff" : "var(--app-brand)" }} />
                  {o.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
