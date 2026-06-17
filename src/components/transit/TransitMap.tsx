"use client";

import { useMemo } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import { FREDERICK_COUNTY_BBOX } from "@/lib/geo";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { STYLE_URL } from "@/components/map/constants";
import { applyFrederickPalette } from "@/components/map/applyFrederickPalette";
import LiveBuses from "@/components/map/LiveBuses";
import type { LineFC, TransitStop } from "@/lib/integrations/transitFrederick";
import { MARC_STATIONS } from "@/data/marc-stations";
import "mapbox-gl/dist/mapbox-gl.css";

/**
 * TransitMap — Carroll-Creek-slate route lines drawn on the same
 * Frederick-palette Mapbox base the rest of the app uses.
 *
 * Visual choices
 *   - One Source with all 36 routes. No per-route color — every line
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
 * Honest sourcing: route shapes come from MD Open Data (Socrata,
 * keyless, weekly revalidate via transitFrederick.ts). Stops and
 * schedules need the live GTFS feed (not yet confirmed with the
 * county) and will arrive in a later phase.
 */
export default function TransitMap({
  shapes,
  stops = [],
  height = 380,
  center,
  zoom,
  liveBuses = false,
}: {
  shapes: LineFC;
  /** Real Frederick County TransIT stops (MD Open Data, 4zcx-89nc).
   *  Each rendered as a small Carroll-Creek-slate dot. Pre-launch the
   *  /transit page had only route lines; stops are the second half
   *  of "what does the network look like" — the question "where do
   *  I catch the bus" now has a visible answer. */
  stops?: TransitStop[];
  height?: number;
  /** Initial center [lng, lat]; defaults to the county centroid. */
  center?: [number, number];
  /** Initial zoom; defaults to 9 (county-wide). */
  zoom?: number;
  /** Overlay live TransIT vehicle positions (LiveBuses). */
  liveBuses?: boolean;
}) {
  const initial = useMemo(() => {
    const cx = center?.[0] ?? (FREDERICK_COUNTY_BBOX.west + FREDERICK_COUNTY_BBOX.east) / 2;
    const cy = center?.[1] ?? (FREDERICK_COUNTY_BBOX.south + FREDERICK_COUNTY_BBOX.north) / 2;
    // Tighter than CountyOverview so downtown's dense route cluster reads
    // cleanly from the start; the user can zoom out for the outer routes.
    return { longitude: cx, latitude: cy, zoom: zoom ?? 9 };
  }, [center, zoom]);

  // No routes means the upstream feed failed. Render a quiet empty
  // state instead of a blank map.
  if (shapes.features.length === 0) {
    return (
      <div
        className="grid place-items-center rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-sunken)] p-6 text-center text-[13px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)", height }}
      >
        Route shapes unavailable right now. Check back shortly.
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)", height }}
    >
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={STYLE_URL}
        initialViewState={initial}
        style={{ width: "100%", height: "100%" }}
        // Drag + pinch on; cooperative gestures off so a single-finger
        // pan works without the "use two fingers" hint.
        interactive
        cooperativeGestures={false}
        onLoad={(e) => applyFrederickPalette(e.target)}
      >
        {/* The loader types geometry as `unknown` to stay defensive
            about Socrata's response, but Mapbox's Source needs the
            strict GeoJSON shape. Cast at the boundary — the
            normalizer in transitFrederick.ts has already filtered to
            LineString/MultiLineString features. */}
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
              // Carroll Creek slate, the brand's "calm civic" hue.
              "line-color": "#2F5470",
              "line-width": 3,
              "line-opacity": 0.8,
            }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
          />
        </Source>

        {/* Stops — only rendered when the upstream feed returned a
            non-empty list. Drawn AFTER the route lines so the dots
            sit on top, with a thin white halo so they read on any
            tile background. Tiny radius + zoom-scaled so the network
            looks clean at county zoom and stops become readable when
            the user zooms into a single corridor. */}
        {stops.length > 0 && (
          <Source
            id="transit-stops"
            type="geojson"
            data={{
              type: "FeatureCollection",
              features: stops.map((s) => ({
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
                "circle-color": "#2F5470",
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.2,
                "circle-opacity": 0.92,
              }}
            />
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
              "circle-color": "#A03A22",
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
              "text-color": "#A03A22",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.5,
            }}
          />
        </Source>

        {/* Real-time vehicle positions — route-colored badges that glide
            between polls. Self-hides when the feed reports zero. */}
        <LiveBuses show={liveBuses} />
      </Map>

      {/* Editorial badge — top-left. Tells the user what the painted
          lines represent without competing with the Mapbox attribution
          in the bottom corner. Count is route + stop when both are
          present, route-only when stops failed to load. */}
      <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--app-cool)" }}
        />
        TransIT Frederick · {shapes.features.length} routes
        {stops.length > 0 && ` · ${stops.length} stops`}
      </span>
    </div>
  );
}
