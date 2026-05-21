"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
import { Footprints, Bike, Car, Navigation } from "lucide-react";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import type { TravelMode } from "@/lib/geo";
import { formatDistance } from "@/lib/geo";
import type { MapRef } from "react-map-gl/mapbox";
// Mapbox CSS — without this, tile rendering and canvas sizing fail
// silently (you see the canvas + overlays but no base map).
import "mapbox-gl/dist/mapbox-gl.css";

/**
 * RadiusMap — the new visual hero for /radius. A real Mapbox map with
 * the radius drawn as a circle overlay, replacing the abstract SVG
 * RadiusRing. Center pin + edge place name + count stat bar at the
 * bottom (same shape as the previous hero) so the page still reads as
 * "one diagram" instead of separate cards.
 *
 * The map is dynamically imported so SSR doesn't try to render Mapbox.
 * Camera flies to fit the circle when the center / radius changes.
 */

// Dynamic-import the react-map-gl/mapbox bits so the heavy Mapbox JS
// stays out of the SSR bundle (same pattern AppMap uses on /map).
const Map = dynamic(() => import("react-map-gl/mapbox").then((m) => m.default), {
  ssr: false,
  loading: () => null,
});
const Source = dynamic(() => import("react-map-gl/mapbox").then((m) => m.Source), { ssr: false });
const Layer = dynamic(() => import("react-map-gl/mapbox").then((m) => m.Layer), { ssr: false });
const Marker = dynamic(() => import("react-map-gl/mapbox").then((m) => m.Marker), { ssr: false });

const STYLE_URL = "mapbox://styles/mapbox/standard";

const MODE_ICON: Partial<Record<TravelMode, typeof Footprints>> = {
  walk: Footprints,
  bike: Bike,
  drive: Car,
};

const MODE_HEX: Partial<Record<TravelMode, string>> = {
  walk: "#2A5D8F",
  bike: "#3B7A52",
  drive: "#C4451C",
};

/** Build a 72-step polygon approximating a circle of `meters` around
 *  `center`. Same shape AppMap's circlePolygon uses for the legacy
 *  RADIUS_M ring; copied here so this component stays self-contained. */
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

/** Bounds [west, south, east, north] padded ~25% beyond the circle so
 *  it sits inside the viewport with breathing room, not cropped at the
 *  edges. */
function paddedBounds(
  center: { lng: number; lat: number },
  meters: number,
): [number, number, number, number] {
  const pad = meters * 1.25;
  const latR = pad / 111320;
  const lngR = pad / (111320 * Math.cos((center.lat * Math.PI) / 180));
  return [
    center.lng - lngR,
    center.lat - latR,
    center.lng + lngR,
    center.lat + latR,
  ];
}

export default function RadiusMap({
  mode,
  minutes,
  meters,
  center,
  centerLabel,
  edge,
  countInside,
}: {
  mode: TravelMode;
  minutes: number;
  meters: number;
  center: { lng: number; lat: number };
  centerLabel: string;
  edge: { name: string; distance_m: number } | null;
  countInside: number;
}) {
  const Icon = MODE_ICON[mode] ?? Footprints;
  const accentHex = MODE_HEX[mode] ?? "#2A5D8F";
  const mapRef = useRef<MapRef | null>(null);

  // The circle GeoJSON updates as the slider moves; useMemo keeps it
  // referentially stable across renders that don't change the inputs.
  const circle = useMemo(
    () => circlePolygon(center, meters),
    [center.lng, center.lat, meters],
  );

  const initialBounds = useMemo(
    () => paddedBounds(center, meters),
    // intentionally only on mount; useEffect handles later moves
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Recenter + refit when center or radius change. easeTo with a calm
  // cubic so the camera glides instead of snapping.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const [w, s, e, n] = paddedBounds(center, meters);
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 24, duration: 540, easing: (t) => t * (2 - t) },
    );
  }, [center.lng, center.lat, meters]);

  // Fallback skeleton if Mapbox isn't configured — keeps the layout
  // height consistent and gives an honest message instead of a blank
  // rectangle.
  if (!MAPBOX_TOKEN) {
    return (
      <RadiusFrame
        mode={mode}
        minutes={minutes}
        meters={meters}
        Icon={Icon}
        edge={edge}
        countInside={countInside}
        centerLabel={centerLabel}
        accentHex={accentHex}
      >
        <div
          className="grid h-full w-full place-items-center text-[12px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Map preview unavailable
        </div>
      </RadiusFrame>
    );
  }

  return (
    <RadiusFrame
      mode={mode}
      minutes={minutes}
      meters={meters}
      Icon={Icon}
      edge={edge}
      countInside={countInside}
      centerLabel={centerLabel}
      accentHex={accentHex}
    >
      <Map
        ref={(r) => {
          mapRef.current = r as unknown as MapRef | null;
        }}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={STYLE_URL}
        initialViewState={{
          bounds: initialBounds,
          fitBoundsOptions: { padding: 24 },
        }}
        interactive={false}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <Source id="radius-circle" type="geojson" data={circle}>
          <Layer
            id="radius-circle-fill"
            type="fill"
            paint={{
              "fill-color": accentHex,
              "fill-opacity": 0.16,
            }}
          />
          <Layer
            id="radius-circle-line"
            type="line"
            paint={{
              "line-color": accentHex,
              "line-width": 2,
              "line-opacity": 0.85,
            }}
          />
        </Source>
        <Marker longitude={center.lng} latitude={center.lat} anchor="center">
          <span
            aria-hidden
            style={{
              position: "relative",
              display: "grid",
              placeItems: "center",
              width: 18,
              height: 18,
              borderRadius: 9999,
              background: accentHex,
              border: "3px solid #fff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            }}
          />
        </Marker>
      </Map>
    </RadiusFrame>
  );
}

/**
 * Static chrome around the map: the bordered card + center label pill
 * + stat bar at the bottom + edge-place footer. Same visual shape the
 * previous SVG RadiusRing established, so the page reads as a refinement
 * of the existing hero rather than a rewrite.
 */
function RadiusFrame({
  children,
  mode,
  minutes,
  meters,
  Icon,
  edge,
  countInside,
  centerLabel,
  accentHex,
}: {
  children: React.ReactNode;
  mode: TravelMode;
  minutes: number;
  meters: number;
  Icon: typeof Footprints;
  edge: { name: string; distance_m: number } | null;
  countInside: number;
  centerLabel: string;
  accentHex: string;
}) {
  return (
    <section
      aria-label="Radius preview"
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      {/* The map canvas itself. A fixed aspect ratio keeps the hero
          consistent across screen sizes; map fills 100% inside. */}
      <div
        className="relative w-full"
        style={{ aspectRatio: "16 / 11", background: "var(--app-bg-sunken)" }}
      >
        {children}
        {/* Center label pill — overlay so the user can ground the map
            instantly without reading the dropdown below. */}
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
      </div>
      {/* Stat bar — mode icon + minutes + In range count. */}
      <div
        className="flex items-stretch border-t"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="flex flex-1 items-center gap-2.5 px-4 py-2.5">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `color-mix(in srgb, ${accentHex} 18%, transparent)`,
              color: accentHex,
            }}
          >
            <Icon className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              {mode === "walk" ? "Walking" : mode === "bike" ? "Biking" : "Driving"}
            </p>
            <p
              className="font-serif text-[18px] font-semibold leading-tight tabular-nums"
              style={{ color: "var(--app-ink)" }}
            >
              {minutes} min
              <span
                className="ml-1.5 text-[12px] font-medium"
                style={{ color: "var(--app-ink-3)" }}
              >
                · {formatDistance(meters)}
              </span>
            </p>
          </div>
        </div>
        <div
          className="flex flex-1 items-center gap-2.5 border-l px-4 py-2.5"
          style={{ borderColor: "var(--app-border)" }}
        >
          <span
            aria-hidden
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
              color: "var(--app-brand)",
            }}
          >
            <Navigation className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              In range
            </p>
            <p
              className="font-serif text-[18px] font-semibold leading-tight tabular-nums"
              style={{ color: "var(--app-ink)" }}
            >
              {countInside.toLocaleString()}
              <span
                className="ml-1.5 text-[12px] font-medium"
                style={{ color: "var(--app-ink-3)" }}
              >
                place{countInside === 1 ? "" : "s"}
              </span>
            </p>
          </div>
        </div>
      </div>
      {edge && (
        <p
          className="border-t px-4 py-2 text-[11.5px] truncate"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          At the edge:{" "}
          <span
            className="font-semibold"
            style={{ color: "var(--app-ink-2)" }}
          >
            {edge.name}
          </span>{" "}
          <span className="tabular-nums">· {formatDistance(edge.distance_m)} away</span>
        </p>
      )}
    </section>
  );
}
