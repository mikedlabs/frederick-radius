"use client";

import { useEffect, useRef, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/mapbox";
import { OVERLAYS, type OverlayKey } from "@/lib/overlays";

/**
 * Map overlays (data brief 6.3/6.4).
 *
 * Renders the toggled overlay layers (parks, farmers markets, public
 * art, ...) as a self-contained unit inside the map. It owns its own
 * lazy fetch, its own Sources/Layers, and its own click popups via the
 * map instance, so AppMap's render and click handling stay untouched.
 *
 * Each overlay loads once on first toggle and is cached; toggling it off
 * unmounts its Source so it costs nothing. The map opens with no overlay
 * active (dark by default), the reader pulls one in when they want it.
 */

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Per-overlay dot color. RESOLVED hex, NOT var(--app-*): these values
// feed Mapbox GL paint expressions, which cannot read CSS custom
// properties — a var() here fails to parse and the layer never colorizes
// or renders (the bug that made overlays look broken). Values mirror the
// brand tokens in src/app/globals.css; keep them in sync if a token moves.
// (The earlier var() fallbacks had drifted stale: warning/ink-2/brand-2
// no longer matched the tokens.)
const COLOR: Partial<Record<OverlayKey, string>> = {
  parks: "#1E6B3A",     // --app-positive
  markets: "#B26B00",   // --app-warning
  art: "#E14328",       // --app-brand (Signal vermilion)
  trails: "#1E6B3A",    // --app-positive
  historic: "#423E34",  // --app-ink-2
  bridges: "#16352B",   // --app-brand-2 (Spruce)
};

const ENDPOINT = new Map(OVERLAYS.map((o) => [o.key, o.endpoint] as const));

type PopupState = {
  lng: number;
  lat: number;
  name: string;
  address?: string;
  sourceUrl?: string;
};

export default function MapOverlays({ active }: { active: OverlayKey[] }) {
  const { current: map } = useMap();
  const [data, setData] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const [popup, setPopup] = useState<PopupState | null>(null);
  // Keys whose fetch has started, so a re-render never refetches.
  const started = useRef<Set<string>>(new Set());

  // Lazy load: fetch each newly active overlay's GeoJSON once.
  useEffect(() => {
    let cancelled = false;
    for (const key of active) {
      if (started.current.has(key)) continue;
      const url = ENDPOINT.get(key);
      if (!url) continue;
      started.current.add(key);
      fetch(url)
        .then((r) => (r.ok ? r.json() : EMPTY_FC))
        .then((fc: GeoJSON.FeatureCollection) => {
          if (!cancelled) setData((d) => ({ ...d, [key]: fc }));
        })
        .catch(() => {
          // A failed overlay fetch degrades to nothing, never a crash.
          started.current.delete(key);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [active]);

  // Click popups + cursor feedback, attached to the live map instance so
  // AppMap's own onClick/interactiveLayerIds are not involved.
  useEffect(() => {
    const m = map?.getMap();
    if (!m) return;
    // Points AND polygon fills are tappable (a park's grounds answer
    // "what park is this?" just like its marker does).
    const layerIds = active.flatMap((k) => [`ov-${k}-pt`, `ov-${k}-fill`]);

    const onClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = (f.properties ?? {}) as Record<string, string>;
      // Anchor at the marker for points; at the tap for area fills.
      const at =
        f.geometry.type === "Point"
          ? { lng: (f.geometry as GeoJSON.Point).coordinates[0], lat: (f.geometry as GeoJSON.Point).coordinates[1] }
          : { lng: e.lngLat.lng, lat: e.lngLat.lat };
      setPopup({
        ...at,
        name: p.name || p.title || "Untitled",
        address: p.Address || p.Location || undefined,
        sourceUrl: p.source_url || undefined,
      });
    };
    const enter = () => {
      m.getCanvas().style.cursor = "pointer";
    };
    const leave = () => {
      m.getCanvas().style.cursor = "";
    };

    for (const id of layerIds) {
      if (!m.getLayer(id)) continue;
      m.on("click", id, onClick);
      m.on("mouseenter", id, enter);
      m.on("mouseleave", id, leave);
    }
    return () => {
      for (const id of layerIds) {
        m.off("click", id, onClick);
        m.off("mouseenter", id, enter);
        m.off("mouseleave", id, leave);
      }
    };
  }, [map, active, data]);

  return (
    <>
      {active.map((key) => {
        const fc = data[key];
        if (!fc) return null;
        const color = COLOR[key] ?? "#E14328";
        // Geometry-aware: a layer can carry polygons (park grounds) AND
        // points (named markers) in one file. Fills draw first (under),
        // points draw over them; the filters keep each Layer honest, so
        // a points-only layer renders exactly as before.
        return (
          <Source key={key} id={`ov-${key}`} type="geojson" data={fc}>
            <Layer
              id={`ov-${key}-fill`}
              type="fill"
              filter={["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]]}
              paint={{
                "fill-color": color,
                "fill-opacity": 0.16,
              }}
            />
            <Layer
              id={`ov-${key}-edge`}
              type="line"
              filter={["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]]}
              paint={{
                "line-color": color,
                "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 14, 1.2],
                "line-opacity": 0.5,
              }}
            />
            <Layer
              id={`ov-${key}-pt`}
              type="circle"
              filter={["==", ["geometry-type"], "Point"]}
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 14, 6, 17, 9],
                "circle-color": color,
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1.5,
                "circle-opacity": 0.9,
              }}
            />
          </Source>
        );
      })}
      {popup && (
        <Popup
          longitude={popup.lng}
          latitude={popup.lat}
          anchor="bottom"
          offset={12}
          closeOnClick={false}
          onClose={() => setPopup(null)}
          maxWidth="240px"
        >
          {/* A field-guide entry, not a tooltip: serif display name over
              a hairline rule, then the quiet detail line. */}
          <div style={{ padding: "2px 2px 4px" }}>
            <div
              className="font-serif"
              style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.25, color: "var(--app-ink, #16140E)" }}
            >
              {popup.name}
            </div>
            <div
              aria-hidden
              style={{ height: 1, background: "var(--app-border, #D9D2C3)", margin: "5px 0 4px" }}
            />
            {popup.address && (
              <div style={{ fontSize: 11, color: "var(--app-ink-2, #4A4636)" }}>
                {popup.address}
              </div>
            )}
            {popup.sourceUrl && (
              <a
                href={popup.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, fontWeight: 600, color: "var(--app-brand, #E14328)", marginTop: 4, display: "inline-block" }}
              >
                More
              </a>
            )}
          </div>
        </Popup>
      )}
    </>
  );
}
