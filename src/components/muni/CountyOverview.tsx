"use client";

import Link from "next/link";
import { useMemo } from "react";
import Map, { Marker, AttributionControl } from "react-map-gl/mapbox";
import { MUNICIPALITIES } from "@/data/municipalities";
import { FREDERICK_COUNTY_BBOX } from "@/lib/geo";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { STYLE_URL } from "@/components/map/constants";
import { applyFrederickPalette } from "@/components/map/applyFrederickPalette";
import "mapbox-gl/dist/mapbox-gl.css";

/**
 * CountyOverview — a single editorial map that shows the whole county.
 *
 * Solves the "what is this?" positioning problem: Frederick Radius
 * covers all 12 municipalities, not just downtown. The strip and the
 * /m pages prove this in lists; this component proves it spatially.
 * A first-time visitor lands on /about and can see at a glance that
 * Brunswick is south, Thurmont is north, Mt Airy is east, etc.
 *
 * Deliberate choices:
 *   - Interactive disabled (drag/zoom/scroll off). This isn't /map.
 *     One look, then tap a town to go to its page.
 *   - No layer chrome, no traffic, no civic alerts. Just county +
 *     municipality nodes. Decoration would dilute the signal.
 *   - Frederick (downtown) gets a slightly larger marker because it
 *     IS the county seat. Hierarchy reflects reality.
 *   - Fits to the county bbox with padding so the view always looks
 *     the same regardless of viewport — no "did I scroll the right
 *     spot?" confusion.
 *
 * Not a 3D model. Not a stylized SVG. The actual Mapbox view, fit to
 * the county. Honest spatial answer to a spatial question.
 */
export default function CountyOverview({
  height = 360,
  highlightSlug,
}: {
  height?: number;
  highlightSlug?: string;
}) {
  // Initial viewport fits the county bbox with a small breathing
  // margin. Memoize so React doesn't re-derive every render.
  const initial = useMemo(() => {
    const cx = (FREDERICK_COUNTY_BBOX.west + FREDERICK_COUNTY_BBOX.east) / 2;
    const cy = (FREDERICK_COUNTY_BBOX.south + FREDERICK_COUNTY_BBOX.north) / 2;
    return { longitude: cx, latitude: cy, zoom: 8.4 };
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)", height }}
    >
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={STYLE_URL}
        initialViewState={initial}
        // One-glance overview, not an interactive surface. The /map
        // route is the interactive one; this is editorial chrome.
        interactive={false}
        cooperativeGestures={false}
        // Mapbox ToS: logo + credits must remain visible when using their
        // tiles. The compact ⓘ control below satisfies that quietly.
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
        onLoad={(e) => applyFrederickPalette(e.target)}
      >
        <AttributionControl compact position="bottom-right" />
        {MUNICIPALITIES.map((m) => {
          const isSeat = m.slug === "frederick";
          const isHighlight = highlightSlug === m.slug;
          return (
            <Marker
              key={m.slug}
              longitude={m.centroid.lng}
              latitude={m.centroid.lat}
              anchor="bottom"
            >
              {/* Link wraps the marker so the whole pin + label is
                  one tap target. Anchored at bottom so the dot sits
                  exactly on the centroid. */}
              <Link
                href={`/m/${m.slug}`}
                aria-label={`Open ${m.name}`}
                className="group block translate-y-[6px] cursor-pointer text-center"
              >
                <div className="flex flex-col items-center gap-1">
                  <span
                    aria-hidden
                    className="rounded-full ring-1 ring-white/80 shadow-[0_2px_4px_rgba(0,0,0,0.35)] transition-transform group-hover:scale-110"
                    style={{
                      width: isSeat ? 14 : 10,
                      height: isSeat ? 14 : 10,
                      background: isHighlight
                        ? "var(--app-brand)"
                        : isSeat
                          ? "var(--app-brand)"
                          : "var(--app-cool)",
                    }}
                  />
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight tracking-tight transition-opacity"
                    style={{
                      background: "rgba(255,255,255,0.94)",
                      color: "var(--app-ink)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
                      opacity: isSeat || isHighlight ? 1 : 0.92,
                    }}
                  >
                    {m.name.replace(/^Downtown\s+/, "")}
                  </span>
                </div>
              </Link>
            </Marker>
          );
        })}
      </Map>

      {/* Editorial badge — top-left. Tells the user at a glance what
          they're looking at without competing with the default Mapbox
          attribution down at the bottom. */}
      <span
        className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm"
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--app-brand)" }}
        />
        {MUNICIPALITIES.length} municipalities
      </span>
    </div>
  );
}
