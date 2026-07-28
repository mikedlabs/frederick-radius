"use client";

import { useEffect, useRef, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/mapbox";
import { OVERLAYS, type OverlayKey } from "@/lib/overlays";
import { BRAND } from "@/lib/brand";
import { directionsHref } from "@/lib/map/directionsHref";

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
const LAYER_FADE_MS = 220;

// Per-overlay dot color. Resolved values come from the brand contract because
// Mapbox GL paint expressions cannot read CSS custom properties; a var() here
// fails to parse and the layer never colorizes or renders.
const COLOR: Partial<Record<OverlayKey, string>> = {
  parks: BRAND.colors.forest,
  markets: BRAND.colors.functionalAmber,
  art: BRAND.colors.brick,
  bridges: BRAND.colors.creek,
};

const ENDPOINT = new Map(OVERLAYS.map((o) => [o.key, o.endpoint] as const));
const OVERLAY = new Map(OVERLAYS.map((o) => [o.key, o] as const));
const KIND_LABEL: Record<OverlayKey, string> = {
  parks: "County park",
  art: "Public art",
  markets: "Farmers market",
  bridges: "Covered bridge",
};

type PopupState = {
  lng: number;
  lat: number;
  key: OverlayKey;
  name: string;
  address?: string;
  sourceUrl?: string;
};

export default function MapOverlays({ active }: { active: OverlayKey[] }) {
  const { current: map } = useMap();
  const [data, setData] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [rendered, setRendered] = useState<OverlayKey[]>(active);
  const [visible, setVisible] = useState<Set<OverlayKey>>(
    () => new Set(active),
  );
  // Keys whose fetch has started, so a re-render never refetches.
  const started = useRef<Set<string>>(new Set());

  // Keep a just-disabled layer mounted long enough for Mapbox's paint
  // transition to finish. New layers mount at opacity zero, then become
  // visible on the next frame, so activation reads as a deliberate layer
  // change instead of a hard pop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRendered((current) => [...new Set([...current, ...active])]);
    const frame = window.requestAnimationFrame(() => {
      setVisible(new Set(active));
    });
    const activeSet = new Set(active);
    const cleanup = window.setTimeout(() => {
      setRendered((current) =>
        current.filter((key) => activeSet.has(key)),
      );
    }, LAYER_FADE_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(cleanup);
    };
  }, [active]);

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
      const layerId = f.layer?.id;
      if (!layerId) return;
      const p = (f.properties ?? {}) as Record<string, string>;
      const key = active.find((candidate) =>
        layerId === `ov-${candidate}-pt` || layerId === `ov-${candidate}-fill`,
      );
      if (!key) return;
      // Anchor at the marker for points; at the tap for area fills.
      const at =
        f.geometry.type === "Point"
          ? { lng: (f.geometry as GeoJSON.Point).coordinates[0], lat: (f.geometry as GeoJSON.Point).coordinates[1] }
          : { lng: e.lngLat.lng, lat: e.lngLat.lat };
      setPopup({
        ...at,
        key,
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
      {rendered.map((key) => {
        const fc = data[key];
        if (!fc) return null;
        const color = COLOR[key] ?? "#B5462B";
        const isVisible = visible.has(key);
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
                "fill-opacity": isVisible ? 0.16 : 0,
                "fill-opacity-transition": {
                  duration: LAYER_FADE_MS,
                  delay: 0,
                },
              }}
            />
            <Layer
              id={`ov-${key}-edge`}
              type="line"
              filter={["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]]}
              paint={{
                "line-color": color,
                "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 14, 1.2],
                "line-opacity": isVisible ? 0.5 : 0,
                "line-opacity-transition": {
                  duration: LAYER_FADE_MS,
                  delay: 0,
                },
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
                "circle-opacity": isVisible ? 0.9 : 0,
                "circle-opacity-transition": {
                  duration: LAYER_FADE_MS,
                  delay: 0,
                },
              }}
            />
          </Source>
        );
      })}
      {popup && active.includes(popup.key) && (
        <Popup
          longitude={popup.lng}
          latitude={popup.lat}
          anchor="bottom"
          offset={12}
          closeOnClick
          onClose={() => setPopup(null)}
          maxWidth="240px"
        >
          {/* A field-guide entry, not a tooltip: serif display name over
              a hairline rule, then the quiet detail line. */}
          <div style={{ padding: "2px 2px 4px" }}>
            <div
              style={{
                marginBottom: 3,
                color: "var(--app-brand-press, #9E3824)",
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {KIND_LABEL[popup.key]}
            </div>
            <div
              className="font-serif"
              style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.25, color: "var(--app-ink, #221C15)" }}
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
            <div style={{ marginTop: 5, fontSize: 9.5, lineHeight: 1.35, color: "var(--app-ink-3, #5C5A50)" }}>
              {OVERLAY.get(popup.key)?.sources}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <a
                href={directionsHref(popup.lat, popup.lng)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  minHeight: 40,
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0 12px",
                  borderRadius: 999,
                  background: "var(--app-brand, #B5462B)",
                  color: "var(--app-on-brand, #FCFBF8)",
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                Directions ↗
              </a>
              {popup.sourceUrl && (
                <a
                  href={popup.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, fontWeight: 650, color: "var(--app-brand, #B5462B)" }}
                >
                  Source ↗
                </a>
              )}
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}
