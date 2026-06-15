"use client";

import { useEffect, useState } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import type { RasterLayerSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapbox";

/**
 * Aerial Time Machine — scrub Frederick's history on a real, pannable map.
 *
 * The City of Frederick publishes 15 years of cached orthoimagery as open
 * ArcGIS MapServers (Aerial_1958 … Aerial_2025). We mount each as a Mapbox
 * raster source via the ArcGIS `export` endpoint with the `{bbox-epsg-3857}`
 * token (ArcGIS reprojects to Web Mercator on the fly), then crossfade
 * between years with `raster-opacity`. Pan/zoom anywhere in the city and
 * scrub the decades over your own block.
 *
 * No new data dependency — it reads straight from the City's GIS at runtime.
 */

const AERIAL_YEARS = [
  1958, 1964, 1970, 1983, 1988, 2003, 2005, 2007, 2011, 2014, 2017, 2018, 2020, 2022, 2025,
] as const;

const AERIAL_BASE =
  "https://spires.cityoffrederick.com/arcgis/rest/services/Aerial_";

const tilesFor = (year: number) => [
  `${AERIAL_BASE}${year}/MapServer/export` +
    `?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
    `&size=512,512&dpi=96&format=jpeg&transparent=false&f=image`,
];

// Downtown Frederick.
const INITIAL = { longitude: -77.4105, latitude: 39.4143, zoom: 14.2 };

export default function AerialTimeMachine() {
  const [yearIdx, setYearIdx] = useState(AERIAL_YEARS.length - 1); // default newest
  const activeYear = AERIAL_YEARS[yearIdx];
  // The City's ortho `export` endpoint can hang/fail (the historical
  // layers then never load). Detect that and show an honest banner
  // instead of a silently blank map; the scrubber hides when it's useless.
  const [orthoFailed, setOrthoFailed] = useState(false);

  // Proactive reachability probe: the City's `export` endpoint hangs when
  // it's down, and Mapbox's tile-abort errors don't carry a matchable
  // source, so we ping one tile with a short timeout. If it can't be
  // reached, flip to the honest fallback. (no-cors: we only need to know
  // the request completes, not read its body.)
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const probe =
      `${AERIAL_BASE}${AERIAL_YEARS[AERIAL_YEARS.length - 1]}/MapServer/export` +
      `?bbox=-8617500,4782500,-8616500,4783500&bboxSR=3857&imageSR=3857&size=64,64&format=jpeg&f=image`;
    fetch(probe, { signal: ctrl.signal, mode: "no-cors" })
      .catch(() => setOrthoFailed(true))
      .finally(() => clearTimeout(t));
    return () => { clearTimeout(t); ctrl.abort(); };
  }, []);

  return (
    <div className="relative h-[calc(100vh-var(--app-nav-h,56px))] w-full overflow-hidden">
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={INITIAL}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ position: "absolute", inset: 0 }}
        maxBounds={[
          [-77.55, 39.34],
          [-77.27, 39.50],
        ]}
        attributionControl={false}
        onError={(e) => {
          const src = (e as unknown as { sourceId?: string }).sourceId ?? "";
          const msg = String((e as unknown as { error?: unknown }).error ?? "");
          if (src.startsWith("aerial-") || /cityoffrederick|Aerial_/i.test(msg)) setOrthoFailed(true);
        }}
      >
        {/* Every year is mounted; only the active layer is opaque, so
            scrubbing crossfades with the raster-fade-duration. The newest
            year sits at the bottom as a never-blank base. */}
        {AERIAL_YEARS.map((year) => {
          const isBase = year === AERIAL_YEARS[AERIAL_YEARS.length - 1];
          const opacity = year === activeYear ? 1 : isBase ? 1 : 0;
          const paint: RasterLayerSpecification["paint"] = {
            "raster-opacity": opacity,
            "raster-fade-duration": 350,
            "raster-resampling": "linear",
          };
          return (
            <Source key={year} id={`aerial-${year}`} type="raster" tiles={tilesFor(year)} tileSize={512}>
              <Layer id={`aerial-${year}-layer`} type="raster" paint={paint} />
            </Source>
          );
        })}
      </Map>

      {orthoFailed && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-4">
          <div
            className="pointer-events-auto mx-auto w-full max-w-md rounded-[var(--app-radius-lg)] border p-3.5"
            style={{
              borderColor: "var(--app-border)",
              background: "color-mix(in srgb, var(--app-bg-elevated-solid) 92%, transparent)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-2)",
            }}
          >
            <p className="font-serif text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Historical imagery is unavailable right now
            </p>
            <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              The City of Frederick GIS isn&rsquo;t serving its aerial archive at the moment. The live map still pans below; check back soon for the decade scrubber.
            </p>
          </div>
        </div>
      )}

      {/* ── Scrubber overlay (hidden when the archive is down) ──────── */}
      {!orthoFailed && (
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom,0px)+16px,16px)" }}
      >
        <div
          className="pointer-events-auto mx-auto w-full max-w-md rounded-[var(--app-radius-lg)] border p-4"
          style={{
            borderColor: "var(--app-border)",
            background: "color-mix(in srgb, var(--app-bg-elevated-solid) 88%, transparent)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-2)",
          }}
        >
          <div className="flex items-baseline justify-between">
            <span className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
              From above
            </span>
            <span
              className="font-serif text-[28px] font-semibold leading-none tabular-nums"
              style={{ color: "var(--app-brand)" }}
            >
              {activeYear}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={AERIAL_YEARS.length - 1}
            step={1}
            value={yearIdx}
            onChange={(e) => setYearIdx(Number(e.target.value))}
            aria-label="Aerial year"
            className="mt-3 w-full accent-[var(--app-brand)]"
          />
          <div
            className="mt-1 flex justify-between text-[10px] font-semibold tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            <span>{AERIAL_YEARS[0]}</span>
            <span>{AERIAL_YEARS[AERIAL_YEARS.length - 1]}</span>
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            Pan & zoom anywhere in the city · imagery © City of Frederick GIS
          </p>
        </div>
      </div>
      )}
    </div>
  );
}
