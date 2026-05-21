"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Map as MapIcon, ArrowUpRight } from "lucide-react";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import type { TravelMode } from "@/lib/geo";
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

const STYLE_URL = "mapbox://styles/mapbox/standard";

// Frederick County bbox in the [W, S, E, N] form Mapbox wants for
// fitBounds. Source: src/lib/integrations/overpass.ts (kept in sync).
const COUNTY_BOUNDS: [[number, number], [number, number]] = [
  [-77.700, 39.265],
  [-77.150, 39.745],
];

const MODE_HEX: Partial<Record<TravelMode, string>> = {
  walk: "#2A5D8F",
  bike: "#3B7A52",
  drive: "#C4451C",
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

export default function RadiusMap({
  mode,
  meters,
  center,
  centerLabel,
  insidePlaces,
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
  /** Fires on map tap and on center-pin drag end. Parent can opt out
   *  (omit the prop) to keep the map view-only. */
  onCenterChange?: (next: { lng: number; lat: number }) => void;
  height?: string;
}) {
  const accentHex = MODE_HEX[mode] ?? "#2A5D8F";
  const mapRef = useRef<MapRef | null>(null);
  // Live position while dragging the center pin — gives the radius
  // circle a smooth follow without thrashing parent state on every
  // pointermove. Committed back via onCenterChange on dragend.
  const [drag, setDrag] = useState<{ lng: number; lat: number } | null>(null);
  // The place a user tapped on the map — shows the preview popup. Null
  // when no place is selected (the default).
  const [selected, setSelected] = useState<{
    lng: number;
    lat: number;
    slug: string;
    name: string;
    color: string;
  } | null>(null);

  const effectiveCenter = drag ?? center;

  const circle = useMemo(
    () => circlePolygon(effectiveCenter, meters),
    [effectiveCenter.lng, effectiveCenter.lat, meters],
  );

  const placesGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: insidePlaces.map((p) => ({
        type: "Feature",
        properties: {
          slug: p.slug,
          name: p.name,
          // Falls back to a neutral grey for places that don't have a
          // category color, so a missing taxonomy entry never breaks
          // the whole dot layer.
          color: p.category_color ?? "#7A828C",
        },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
    };
  }, [insidePlaces]);

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
            layers: ["radius-places-dots"],
          })) ?? [];
    if (hits.length > 0) {
      const f = hits[0];
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const props = (f.properties ?? {}) as {
        slug?: string;
        name?: string;
        color?: string;
      };
      if (props.slug && props.name) {
        setSelected({
          lng: coords[0],
          lat: coords[1],
          slug: props.slug,
          name: props.name,
          color: props.color ?? "#7A828C",
        });
        return;
      }
    }
    if (!onCenterChange) return;
    setSelected(null);
    onCenterChange({ lng: e.lngLat.lng, lat: e.lngLat.lat });
  };

  // Live-update the visual position as the user drags the pin, then
  // commit to the parent on dragend so we only push state changes once.
  const onPinDrag = (e: MarkerDragEvent) => {
    setDrag({ lng: e.lngLat.lng, lat: e.lngLat.lat });
  };
  const onPinDragEnd = (e: MarkerDragEvent) => {
    setDrag(null);
    if (onCenterChange) {
      onCenterChange({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    }
  };

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className="relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-sunken)] grid place-items-center"
        style={{ borderColor: "var(--app-border)", height }}
      >
        <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Map preview unavailable
        </p>
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
        initialViewState={{
          bounds: COUNTY_BOUNDS,
          fitBoundsOptions: { padding: 32 },
        }}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        attributionControl={false}
        onClick={handleMapClick}
        interactiveLayerIds={["radius-places-dots"]}
        cursor={onCenterChange ? "crosshair" : "grab"}
        style={{ width: "100%", height: "100%" }}
      >
        {/* In-range places as category-colored dots — the map now reads
            as a story at a glance: food clusters orange, parks green,
            arts purple. Each dot is tappable; the click handler decides
            whether the tap is a place preview or a center-set. */}
        <Source id="radius-places" type="geojson" data={placesGeoJson}>
          <Layer
            id="radius-places-dots"
            type="circle"
            paint={{
              // Slightly bigger than the previous 3.5px so taps land
              // reliably on mobile, and the color story carries.
              "circle-radius": 4.5,
              "circle-color": ["get", "color"],
              "circle-opacity": 0.85,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.2,
              "circle-stroke-opacity": 0.85,
            }}
          />
        </Source>
        {/* The radius itself — soft fill + crisp line. */}
        <Source id="radius-circle" type="geojson" data={circle}>
          <Layer
            id="radius-circle-fill"
            type="fill"
            paint={{ "fill-color": accentHex, "fill-opacity": 0.13 }}
          />
          <Layer
            id="radius-circle-line"
            type="line"
            paint={{
              "line-color": accentHex,
              "line-width": 2.5,
              "line-opacity": 0.9,
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
              borderRadius: 9999,
              background: accentHex,
              border: "3px solid #fff",
              boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
              cursor: onCenterChange ? "grab" : "default",
            }}
          />
        </Marker>
        {/* Place preview popup — shows when a user taps a colored dot.
            Tiny by design: the name + a colored badge for the category
            + a See place link to /places/[slug]. The popup itself
            doesn't carry a photo so the layout stays compact and any
            slow photo load doesn't shift the map. */}
        {selected && (
          <Popup
            longitude={selected.lng}
            latitude={selected.lat}
            anchor="bottom"
            offset={10}
            closeOnClick={false}
            onClose={() => setSelected(null)}
            maxWidth="240px"
          >
            <div style={{ minWidth: 180, padding: 2 }}>
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
                  href={`/places/${selected.slug}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 700,
                    color: selected.color,
                  }}
                >
                  See place
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
