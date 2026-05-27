"use client";

import { useMemo } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import { FREDERICK_COUNTY_BBOX } from "@/lib/geo";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { STYLE_URL } from "@/components/map/constants";
import { applyFrederickPalette } from "@/components/map/applyFrederickPalette";
import type { LineFC } from "@/lib/integrations/transitFrederick";
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
  height = 380,
}: {
  shapes: LineFC;
  height?: number;
}) {
  const initial = useMemo(() => {
    const cx = (FREDERICK_COUNTY_BBOX.west + FREDERICK_COUNTY_BBOX.east) / 2;
    const cy = (FREDERICK_COUNTY_BBOX.south + FREDERICK_COUNTY_BBOX.north) / 2;
    // Slightly tighter zoom than CountyOverview so downtown's dense
    // route cluster reads cleanly from the start. The user can zoom
    // back out to see the outer routes (Thurmont, Brunswick).
    return { longitude: cx, latitude: cy, zoom: 9 };
  }, []);

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
      </Map>

      {/* Editorial badge — top-left. Tells the user what the painted
          lines represent without competing with the Mapbox attribution
          in the bottom corner. */}
      <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--app-cool)" }}
        />
        TransIT Frederick · {shapes.features.length} routes
      </span>
    </div>
  );
}
