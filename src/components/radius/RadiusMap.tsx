"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Map as MapIcon, ArrowUpRight, X } from "lucide-react";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import type { TravelMode } from "@/lib/geo";
import { CATEGORY_BY_SLUG } from "@/data/categories";
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
  walk: "#2F5470",
  bike: "#3B7A52",
  drive: "#A8462C",
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
 * One in-range place rendered as a colored dot on the map. Carries the
 * minimum metadata needed to color the dot by category and to surface a
 * tap-preview popup (slug + name); no photo URL, no full place record,
 * so the props stay light even at 500+ places.
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
  insidePlaces,
  events = [],
  reachable,
  onCenterChange,
  // Tuned so the map AND the control card below it (mode toggle +
  // slider) fit in one mobile viewport. The previous 60vh buried the
  // slider below the fold, which broke the "see what you're doing
  // while adjusting" loop.
  height = "min(42vh, 360px)",
}: {
  mode: TravelMode;
  meters: number;
  center: { lng: number; lat: number };
  centerLabel: string;
  /** Pre-filtered to places inside the radius. Rendered as small dots
   *  so users can see geographic density, not just read a count. */
  insidePlaces: InsideDot[];
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
  height?: string;
}) {
  const accentHex = MODE_HEX[mode] ?? "#2F5470";
  const mapRef = useRef<MapRef | null>(null);
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

  const placesGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: insidePlaces.map((p) => ({
        type: "Feature",
        properties: {
          slug: p.slug,
          name: p.name,
          // Category slug rides along so the hover and tap popups can
          // show a human label resolved via CATEGORY_BY_SLUG.
          category: p.category,
          // Falls back to a neutral grey for places that don't have a
          // category color, so a missing taxonomy entry never breaks
          // the whole dot layer.
          color: p.category_color ?? "#7A828C",
        },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
    };
  }, [insidePlaces]);

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
            layers: ["radius-places-dots", "radius-events-dots"],
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
        setSelected({
          lng: coords[0],
          lat: coords[1],
          slug: props.slug,
          name: props.name,
          // Events ride a fixed brand tint (their ring marker isn't
          // category-colored); places keep their category color.
          color: isEvent ? "#A8462C" : props.color ?? "#7A828C",
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
            Nearby places still work — the controls and list below are all here.
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
        }}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        attributionControl={false}
        onClick={handleMapClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        interactiveLayerIds={["radius-places-dots", "radius-events-dots"]}
        // Pointer over a dot, otherwise the move-center crosshair (or a
        // plain grab when the map is view-only).
        cursor={hover ? "pointer" : onCenterChange ? "crosshair" : "grab"}
        style={{ width: "100%", height: "100%" }}
      >
        {/* In-range places as category-colored dots — the map now reads
            as a story at a glance: food clusters orange, parks green,
            arts purple. Each dot is tappable; the click handler decides
            whether the tap is a place preview or a center-set. */}
        {/* generateId lets Mapbox assign stable numeric feature ids so
            feature-state (the hover size bump) works. */}
        <Source id="radius-places" type="geojson" data={placesGeoJson} generateId>
          <Layer
            id="radius-places-dots"
            type="circle"
            paint={{
              // 4.5px at rest, 7px on hover (feature-state). Slightly
              // bigger than the old 3.5px so taps land reliably on
              // mobile and the color story carries.
              "circle-radius": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                7,
                4.5,
              ],
              "circle-color": ["get", "color"],
              "circle-opacity": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                1,
                0.85,
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                2,
                1.2,
              ],
              "circle-stroke-opacity": 0.85,
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
        <Source id="radius-reach" type="geojson" data={reachData}>
          <Layer
            id="radius-reach-fill"
            type="fill"
            paint={{
              "fill-color": accentHex,
              "fill-opacity": usingIsochrone ? 0.18 : 0.10,
            }}
          />
          <Layer
            id="radius-reach-line"
            type="line"
            paint={{
              "line-color": accentHex,
              "line-width": usingIsochrone ? 2.5 : 2,
              "line-opacity": usingIsochrone ? 0.92 : 0.55,
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
              "circle-stroke-color": "#A8462C",
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
              width: 22,
              height: 22,
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
                width: 22,
                height: 22,
                borderRadius: 9999,
                border: `2px solid ${accentHex}`,
              }}
            />
            <span
              className="radius-ripple"
              style={{
                position: "absolute",
                width: 22,
                height: 22,
                borderRadius: 9999,
                border: `2px solid ${accentHex}`,
                animationDelay: "1400ms",
              }}
            />
            {/* Breathing core dot. */}
            <span
              className="radius-breathe"
              style={{
                position: "relative",
                width: 22,
                height: 22,
                borderRadius: 9999,
                background: accentHex,
                border: "3px solid #fff",
                boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
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
                  color: "#1A1A1A",
                  fontFamily: "var(--font-plex-serif)",
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
                  color: "#1A1A1A",
                  fontFamily: "var(--font-plex-serif)",
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
      </Map>

      {/* Center label pill — names the current center without making
          the user look at the dropdown below. */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em]"
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
        <div className="pointer-events-none absolute bottom-3 left-3 z-10">
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
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={fitToRadius}
          aria-label="Fit radius"
          title="Fit radius"
          className="grid h-9 w-9 place-items-center rounded-full border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)] transition active:scale-[0.94]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          <Crosshair className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={fitToCounty}
          aria-label="Show whole county"
          title="Show whole county"
          className="grid h-9 w-9 place-items-center rounded-full border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)] transition active:scale-[0.94]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          <MapIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </section>
  );
}
